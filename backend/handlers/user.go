package handlers

import (
	"encoding/base64"
	"errors"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-ldap/ldap/v3"
)

// UserResponse — данные пользователя из AD
type UserResponse struct {
	FullName string `json:"fullName"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Dept     string `json:"department"`
	Photo    string `json:"photo,omitempty"` // base64 или data URL
}

type UserLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func identityHeaderCandidates() []string {
	// Можно переопределить порядок/список в .env:
	// AUTH_IDENTITY_HEADERS=X-Forwarded-User,REMOTE_USER,LOGON_USER
	if raw := strings.TrimSpace(os.Getenv("AUTH_IDENTITY_HEADERS")); raw != "" {
		parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' || r == '\n' || r == '\r' || r == '\t' })
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		if len(out) > 0 {
			return out
		}
	}

	// "Как в канборде": primary source — то, что соответствует request.remote_user.
	// В Windows/IIS чаще всего это REMOTE_USER (и/или один из WEBAUTH/SM/LOGON заголовков).
	// Поэтому сначала проверяем именно их.
	return []string{
		"REMOTE_USER",
		"Remote-User",
		"HTTP_REMOTE_USER",
		"WEBAUTH_USER",
		"SM_USER",
		"LOGON_USER",

		// IIS/прокси и распространенные форварды identity.
		"X-WEBAUTH-USER",
		"X-MS-CLIENT-PRINCIPAL-NAME",
		"X-MS-CLIENT-PRINCIPAL",
		"X-Forwarded-User",
		"X-Original-User",
		"X-Forwarded-Remote-User",
		"X-Original-Remote-User",
		"X-Forwarded-Logon-User",
		"X-Original-Logon-User",

		// Прочие варианты.
		"X-Remote-User",
		"X-Authenticated-User",
		"X-Auth-User",
		"X-Forwarded-Principal",
		"X-Username",
	}
}

func usernameFromHeaders(c *gin.Context) string {
	for _, h := range identityHeaderCandidates() {
		if v := strings.TrimSpace(c.GetHeader(h)); v != "" {
			return v
		}
	}
	return ""
}

func tryBind(conn *ldap.Conn, ldapUser, ldapPassword, ldapServer string) error {
	if ldapUser == "" || ldapPassword == "" {
		return nil
	}
	candidates := []string{ldapUser}

	// Если ldapUser не похож на DN/UPN — пробуем варианты UPN.
	if !strings.Contains(ldapUser, "@") && !strings.Contains(ldapUser, "=") {
		if v := strings.TrimSpace(os.Getenv("LDAP_DOMAIN_DNS")); v != "" {
			candidates = append(candidates, ldapUser+"@"+v)
		}
		if v := strings.TrimSpace(os.Getenv("LDAP_DOMAIN")); v != "" {
			candidates = append(candidates, ldapUser+"@"+v)
		}
		if v := strings.TrimSpace(ldapServer); v != "" {
			// ldapServer может быть "tep-m.ru" или "ldap://tep-m.ru:389"
			// достанем DNS-имя.
			v = strings.TrimPrefix(v, "ldap://")
			v = strings.TrimPrefix(v, "ldaps://")
			if i := strings.IndexByte(v, ':'); i >= 0 {
				v = v[:i]
			}
			if v != "" {
				candidates = append(candidates, ldapUser+"@"+v)
			}
		}
	}

	seen := map[string]struct{}{}
	var lastErr error
	for _, dn := range candidates {
		dn = strings.TrimSpace(dn)
		if dn == "" {
			continue
		}
		if _, ok := seen[dn]; ok {
			continue
		}
		seen[dn] = struct{}{}
		if err := conn.Bind(dn, ldapPassword); err == nil {
			return nil
		} else {
			lastErr = err
		}
	}
	return lastErr
}

// getUsernameFromRequest извлекает имя пользователя из запроса (как в AD/SSO)
func getUsernameFromRequest(c *gin.Context) string {
	if v := c.Query("username"); v != "" {
		return v
	}
	// Если reverse-proxy/аутентификация проксирует BasicAuth, можно восстановить пользователя из Authorization.
	if u, _, ok := c.Request.BasicAuth(); ok && strings.TrimSpace(u) != "" {
		return u
	}
	if v := usernameFromHeaders(c); v != "" {
		return v
	}
	if v := os.Getenv("AD_DEFAULT_USER"); v != "" {
		return v
	}
	return "BatyanovskiyGV" // fallback для разработки
}

// DebugRequestIdentity помогает понять, какие идентифицирующие заголовки реально приходят на backend.
// Это полезно в dev-режиме, когда SSO/ReverseProxy может быть не включен.
func DebugRequestIdentity(c *gin.Context) {
	q := c.Query("username")

	cookie := c.GetHeader("Cookie")
	authz := c.GetHeader("Authorization")
	headerValues := gin.H{}
	hasIdentityHeader := false
	for _, h := range identityHeaderCandidates() {
		v := strings.TrimSpace(c.GetHeader(h))
		headerValues[h] = v
		if v != "" {
			hasIdentityHeader = true
		}
	}

	// Возьмем то, что реально вернул getUsernameFromRequest (т.е. уже учтет fallback).
	resolvedRaw := getUsernameFromRequest(c)
	resolvedNorm := normalizeSAMAccountName(resolvedRaw)

	// Если ни query, ни identity-заголовки не были заданы, значит использовался fallback.
	usedFallback := q == "" && !hasIdentityHeader

	c.JSON(http.StatusOK, gin.H{
		"queryUsername": q,
		"hasCookie": cookie != "",
		"cookieLength": len(cookie),
		"authorizationPresent": authz != "",
		"authorizationLength": len(authz),
		"headers":                     headerValues,
		"identityHeaderCandidates":    identityHeaderCandidates(),
		"resolvedRawUsername":        resolvedRaw,
		"resolvedNormalizedUsername": resolvedNorm,
		"usedFallback":              usedFallback,
	})
}

func normalizeSAMAccountName(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return s
	}
	// UPN: user@domain -> user
	if i := strings.IndexByte(s, '@'); i >= 0 {
		s = s[:i]
	}
	// DOMAIN\\user -> user
	if i := strings.LastIndex(s, `\`); i >= 0 {
		s = s[i+1:]
	}
	s = strings.TrimSpace(s)
	// Частый кейс из твоих логинов: `batanovskiy.gv` вместо `BatyanovskiyGV`.
	// Для согласования с sAMAccountName убираем точки.
	if strings.Contains(s, ".") {
		s = strings.ReplaceAll(s, ".", "")
	}
	// Ещё один кейс: часто путают "batanovskiy" / "batyanovskiy".
	// В твоём AD правильный вариант: BatyanovskiyGV.
	ls := strings.ToLower(s)
	if strings.HasPrefix(ls, "batanovskiy") {
		s = "batyanovskiy" + s[len("batanovskiy"):]
	}
	return s
}

func splitSearchBases(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ';' || r == ',' || r == '\n' || r == '\r' || r == '\t'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

func getSearchBases(defaultBaseDN string) []string {
	if v := strings.TrimSpace(os.Getenv("LDAP_SEARCH_BASES")); v != "" {
		return splitSearchBases(v)
	}
	// LDAP_SEARCH_BASE в текущем проекте может быть одной строкой DN.
	// Если вдруг в неё положили несколько DN через ';' — тоже поддержим.
	if v := strings.TrimSpace(os.Getenv("LDAP_SEARCH_BASE")); v != "" && v != defaultBaseDN {
		bs := splitSearchBases(v)
		if len(bs) > 0 {
			return bs
		}
	}
	if strings.TrimSpace(defaultBaseDN) == "" {
		return []string{}
	}
	return []string{defaultBaseDN}
}

// GetUserFromRequest возвращает данные пользователя из AD по данным запроса (для проверки прав)
func GetUserFromRequest(c *gin.Context) *UserResponse {
	username := normalizeSAMAccountName(getUsernameFromRequest(c))
	user, err := fetchUserFromAD(username)
	if err != nil {
		user = getMockUser(username)
	}
	return user
}

type ADDebugUserResponse struct {
	RequestedUsername string `json:"requestedUsername"`
	LdapServer         string `json:"ldapServer"`
	LdapBaseDN         string `json:"ldapBaseDN"`
	LdapUser           string `json:"ldapUser"`
	BindTried          []string `json:"bindTried"`
	Filter             string `json:"filter"`
	OK                 bool   `json:"ok"`
	Error              string `json:"error,omitempty"`
	User               *UserResponse `json:"user,omitempty"`
}

func DebugADUser(c *gin.Context) {
	requested := c.Query("username")
	if requested == "" {
		requested = getUsernameFromRequest(c)
	}
	requested = normalizeSAMAccountName(requested)

	ldapServer := os.Getenv("LDAP_SERVER")
	ldapUser := os.Getenv("LDAP_USER")
	ldapPassword := os.Getenv("LDAP_PASSWORD")
	ldapBaseDN := os.Getenv("LDAP_BASE_DN")
	if ldapServer == "" {
		ldapServer = os.Getenv("LDAP_HOST")
	}
	if ldapBaseDN == "" {
		ldapBaseDN = os.Getenv("LDAP_SEARCH_BASE")
	}

	ldapURL := ldapServer
	if ldapServer != "" && !strings.HasPrefix(ldapURL, "ldap://") && !strings.HasPrefix(ldapURL, "ldaps://") {
		ldapURL = "ldap://" + ldapServer + ":389"
	}

	filter := "(sAMAccountName=" + ldap.EscapeFilter(requested) + ")"

	// Вызовем tryBind, но нам нужно знать, какие DN пытались.
	// Поэтому просто собираем candidates тут же.
	bindCandidates := []string{ldapUser}
	if ldapUser != "" && !strings.Contains(ldapUser, "@") && !strings.Contains(ldapUser, "=") {
		if v := strings.TrimSpace(os.Getenv("LDAP_DOMAIN_DNS")); v != "" {
			bindCandidates = append(bindCandidates, ldapUser+"@"+v)
		}
		if v := strings.TrimSpace(os.Getenv("LDAP_DOMAIN")); v != "" {
			bindCandidates = append(bindCandidates, ldapUser+"@"+v)
		}
		if ldapServer != "" {
			v := strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(ldapServer, "ldap://"), "ldaps://"), "")
			if i := strings.IndexByte(v, ':'); i >= 0 {
				v = v[:i]
			}
			if v != "" {
				bindCandidates = append(bindCandidates, ldapUser+"@"+v)
			}
		}
	}

	resp := ADDebugUserResponse{
		RequestedUsername: requested,
		LdapServer:         ldapServer,
		LdapBaseDN:         ldapBaseDN,
		LdapUser:           ldapUser,
		BindTried:          bindCandidates,
		Filter:             filter,
	}

	if ldapServer == "" || ldapBaseDN == "" {
		resp.OK = false
		resp.Error = "LDAP not configured (LDAP_SERVER or LDAP_BASE_DN missing)"
		c.JSON(http.StatusOK, resp)
		return
	}

	conn, err := ldap.DialURL(ldapURL)
	if err != nil {
		resp.OK = false
		resp.Error = err.Error()
		c.JSON(http.StatusOK, resp)
		return
	}
	defer conn.Close()

	if err := tryBind(conn, ldapUser, ldapPassword, ldapServer); err != nil {
		resp.OK = false
		resp.Error = "bind error: " + err.Error()
		c.JSON(http.StatusOK, resp)
		return
	}

	// Попробуем поиск как в fetchUserFromAD.
	searchReq := ldap.NewSearchRequest(
		ldapBaseDN,
		ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 0, 0, false,
		filter,
		[]string{"displayName", "mail", "department", "sAMAccountName", "thumbnailPhoto"},
		nil,
	)
	result, err := conn.Search(searchReq)
	if err != nil {
		resp.OK = false
		resp.Error = err.Error()
		c.JSON(http.StatusOK, resp)
		return
	}
	if len(result.Entries) == 0 {
		resp.OK = false
		resp.Error = "no entries found for filter"
		c.JSON(http.StatusOK, resp)
		return
	}

	entry := result.Entries[0]
	u := &UserResponse{Username: requested}
	if v := entry.GetAttributeValue("displayName"); v != "" {
		u.FullName = v
	} else {
		u.FullName = requested
	}
	u.Email = entry.GetAttributeValue("mail")
	u.Dept = entry.GetAttributeValue("department")
	resp.OK = true
	resp.User = u
	c.JSON(http.StatusOK, resp)
}

type ADDebugSearchItem struct {
	SAMAccountName string `json:"sAMAccountName"`
	FullName       string `json:"displayName"`
	Email          string `json:"mail"`
	Dept           string `json:"department"`
}

type ADDebugSearchResponse struct {
	Term      string `json:"term"`
	LdapServer string `json:"ldapServer"`
	LdapBaseDN string `json:"ldapBaseDN"`
	Filter    string `json:"filter"`
	OK        bool   `json:"ok"`
	Error     string `json:"error,omitempty"`
	Items     []ADDebugSearchItem `json:"items,omitempty"`
}

func DebugADSearch(c *gin.Context) {
	term := strings.TrimSpace(c.Query("term"))
	if term == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "term required"})
		return
	}

	ldapServer := os.Getenv("LDAP_SERVER")
	ldapUser := os.Getenv("LDAP_USER")
	ldapPassword := os.Getenv("LDAP_PASSWORD")
	ldapBaseDN := os.Getenv("LDAP_BASE_DN")
	if ldapServer == "" {
		ldapServer = os.Getenv("LDAP_HOST")
	}
	if ldapBaseDN == "" {
		ldapBaseDN = os.Getenv("LDAP_SEARCH_BASE")
	}

	ldapURL := ldapServer
	if ldapServer != "" && !strings.HasPrefix(ldapURL, "ldap://") && !strings.HasPrefix(ldapURL, "ldaps://") {
		ldapURL = "ldap://" + ldapServer + ":389"
	}

	filter := "(&(displayName=*" + ldap.EscapeFilter(term) + "*)(sAMAccountName=*))"

	resp := ADDebugSearchResponse{
		Term:       term,
		LdapServer: ldapServer,
		LdapBaseDN: ldapBaseDN,
		Filter:     filter,
	}

	if ldapServer == "" || ldapBaseDN == "" {
		resp.OK = false
		resp.Error = "LDAP not configured (LDAP_SERVER or LDAP_BASE_DN missing)"
		c.JSON(http.StatusOK, resp)
		return
	}

	conn, err := ldap.DialURL(ldapURL)
	if err != nil {
		resp.OK = false
		resp.Error = err.Error()
		c.JSON(http.StatusOK, resp)
		return
	}
	defer conn.Close()

	if err := tryBind(conn, ldapUser, ldapPassword, ldapServer); err != nil {
		resp.OK = false
		resp.Error = "bind error: " + err.Error()
		c.JSON(http.StatusOK, resp)
		return
	}

	searchReq := ldap.NewSearchRequest(
		ldapBaseDN,
		ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 0, 0, false,
		filter,
		[]string{"displayName", "mail", "department", "sAMAccountName"},
		nil,
	)

	result, err := conn.Search(searchReq)
	if err != nil {
		resp.OK = false
		resp.Error = err.Error()
		c.JSON(http.StatusOK, resp)
		return
	}

	items := make([]ADDebugSearchItem, 0, len(result.Entries))
	for _, e := range result.Entries {
		sam := strings.TrimSpace(e.GetAttributeValue("sAMAccountName"))
		if sam == "" {
			continue
		}
		full := strings.TrimSpace(e.GetAttributeValue("displayName"))
		email := strings.TrimSpace(e.GetAttributeValue("mail"))
		dept := strings.TrimSpace(e.GetAttributeValue("department"))
		items = append(items, ADDebugSearchItem{
			SAMAccountName: sam,
			FullName:       full,
			Email:          email,
			Dept:           dept,
		})
		if len(items) >= 20 {
			break
		}
	}

	resp.OK = true
	resp.Items = items
	c.JSON(http.StatusOK, resp)
}

// CanManageSMK проверяет, может ли пользователь управлять СМК (создавать папки, загружать)
// Доступ: ИТ, ИСУП, Руководство (проверка через AD department)
func CanManageSMK(dept string) bool {
	d := strings.ToLower(dept)
	return strings.Contains(d, "ит") ||
		strings.Contains(d, "исуп") ||
		strings.Contains(d, "руковод")
}

// GetCurrentUser возвращает данные текущего пользователя из AD, включая фото
func GetCurrentUser(c *gin.Context) {
	// Если идентификатор пользователя не пришёл (нет REMOTE_USER/SSO-заголовков и query-параметра),
	// возвращаем 401 с WWW-Authenticate (как "Windows auth challenge"),
	// чтобы upstream (IIS/reverse-proxy) мог выполнить integrated auth
	// и проставить remote user / identity-заголовки.
	q := c.Query("username")
	_, _, hasBasicAuth := c.Request.BasicAuth()
	// Узнаем, какой именно identity-заголовок сработал (если какой-то сработал)
	resolvedHeaderName := ""
	resolvedHeaderValue := ""
	for _, h := range identityHeaderCandidates() {
		if v := strings.TrimSpace(c.GetHeader(h)); v != "" {
			resolvedHeaderName = h
			resolvedHeaderValue = v
			break
		}
	}
	hasIdentityHeader := (resolvedHeaderValue != "") || hasBasicAuth
	resolvedRaw := getUsernameFromRequest(c)
	resolvedNorm := normalizeSAMAccountName(resolvedRaw)

	log.Printf("[GetCurrentUser] remote=%s q='%s' header='%s' headerLen=%d basicAuth=%v resolvedRaw='%s' resolvedNorm='%s'",
		c.ClientIP(), q, resolvedHeaderName, len(resolvedHeaderValue), hasBasicAuth, resolvedRaw, resolvedNorm,
	)

	if q == "" && !hasIdentityHeader {
		// Без identity просто просим залогиниться (формой на фронте).
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "unauthorized",
		})
		return
	}

	username := normalizeSAMAccountName(getUsernameFromRequest(c))

	// Пытаемся получить данные из AD
	user, err := fetchUserFromAD(username)
	if err != nil {
		// Fallback на mock-данные, если AD недоступен
		user = getMockUser(username)
	}

	// Если фото не из AD — используем локальную папку /images (как в справочнике)
	if user.Photo == "" {
		user.Photo = "/images/" + getPrimaryPhotoFilename(user.Username)
	}

	// Чтобы фронт и /admin/access всегда имели логин для ролей: иногда в записи AD пустой sAMAccountName в ответе.
	if strings.TrimSpace(user.Username) == "" && q != "" {
		user.Username = normalizeSAMAccountName(q)
	}
	if strings.TrimSpace(user.Username) == "" {
		user.Username = username
	}

	c.JSON(http.StatusOK, user)
}

// UserLogin — канборд-подобный вход по логин/пароль в AD.
// После успешного входа фронт хранит только username и вызывает /user/me?username=...
// (пароль повторно не запрашиваем).
func UserLogin(c *gin.Context) {
	var req UserLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}

	usernameRaw := strings.TrimSpace(req.Username)
	password := req.Password
	if usernameRaw == "" || strings.TrimSpace(password) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password are required"})
		return
	}

	// Для AD lookup нормализуем к sAMAccountName.
	username := normalizeSAMAccountName(usernameRaw)

	ldapServer := os.Getenv("LDAP_SERVER")
	if ldapServer == "" {
		ldapServer = os.Getenv("LDAP_HOST")
	}
	if ldapServer == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "LDAP_SERVER is not configured"})
		return
	}

	ldapURL := ldapServer
	if !strings.HasPrefix(ldapURL, "ldap://") && !strings.HasPrefix(ldapURL, "ldaps://") {
		ldapURL = "ldap://" + ldapServer + ":389"
	}

	conn, err := ldap.DialURL(ldapURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ldap connect error: " + err.Error()})
		return
	}
	defer conn.Close()

	// Проверяем пароль пользователя (bind от имени пользователя).
	if err := tryBind(conn, username, password, ldapServer); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Подтягиваем остальные атрибуты через service-account (fetchUserFromAD).
	user, err := fetchUserFromAD(username)
	if err != nil {
		// Если сервисный аккаунт/поиск не настроены — не падаем, хотя бы вернём username.
		user = getMockUser(username)
	}

	// Если фото не найдено в thumbnailPhoto — применим локальный fallback.
	if user.Photo == "" {
		user.Photo = "/images/" + getPrimaryPhotoFilename(user.Username)
	}

	c.JSON(http.StatusOK, user)
}

// getPrimaryPhotoFilename возвращает имя файла для папки images (BatyanovskiyGV.png)
func getPrimaryPhotoFilename(username string) string {
	filenames := toPhotoFilename(username)
	if len(filenames) > 0 {
		return filenames[0]
	}
	return username + ".png"
}

// toPhotoFilename конвертирует sAMAccountName (batanovskiy.gv) в формат имён файлов
func toPhotoFilename(username string) []string {
	parts := strings.SplitN(username, ".", 2)
	if len(parts) == 1 {
		// САМAccountName без точки: возвращаем как есть, чтобы сохранить регистр.
		s := strings.TrimSpace(parts[0])
		if s != "" {
			return []string{s + ".png"}
		}
		return []string{strings.TrimSpace(username) + ".png"}
	}
	// batanovskiy.gv -> BatyanovskiyGV
	lastName := parts[0]
	initials := strings.ToUpper(parts[1])
	if len(lastName) > 0 {
		lastName = strings.ToUpper(lastName[:1]) + strings.ToLower(lastName[1:])
	}
	pascalCase := lastName + initials
	return []string{
		pascalCase + ".png",      // BatyanovskiyGV.png
		username + ".png",        // batanovskiy.gv.png
		username + ".jpg",        // batanovskiy.gv.jpg
	}
}

func fetchUserFromAD(username string) (*UserResponse, error) {
	// Поддержка конфигурации как в телефонном справочнике
	ldapServer := os.Getenv("LDAP_SERVER")   // tep-m.ru
	ldapUser := os.Getenv("LDAP_USER")       // Batyanovskiy_help
	ldapPassword := os.Getenv("LDAP_PASSWORD")
	ldapBaseDN := os.Getenv("LDAP_BASE_DN")  // DC=tep-m,DC=ru

	// Альтернативные переменные
	if ldapServer == "" {
		ldapServer = os.Getenv("LDAP_HOST")
	}
	if ldapBaseDN == "" {
		ldapBaseDN = os.Getenv("LDAP_SEARCH_BASE")
	}
	if ldapUser == "" {
		ldapUser = os.Getenv("LDAP_BIND_DN")
	}
	if ldapPassword == "" {
		ldapPassword = os.Getenv("LDAP_BIND_PASSWORD")
	}

	if ldapServer == "" || ldapBaseDN == "" {
		return nil, errors.New("LDAP not configured: need LDAP_SERVER and LDAP_BASE_DN")
	}

	// Формируем URL: ldap://tep-m.ru:389 (если указан только хост)
	ldapURL := ldapServer
	if !strings.HasPrefix(ldapURL, "ldap://") && !strings.HasPrefix(ldapURL, "ldaps://") {
		ldapURL = "ldap://" + ldapServer + ":389"
	}

	conn, err := ldap.DialURL(ldapURL)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Bind: UPN user@domain (как в телефонном справочнике: Batyanovskiy_help@tep-m.ru)
	if err := tryBind(conn, ldapUser, ldapPassword, ldapServer); err != nil {
		return nil, err
	}

	// Фильтр максимально надёжный: ищем по sAMAccountName.
	// При необходимости (если зададут LDAP_USER_SEARCH_FILTER) добавим его.
	userFilter := strings.TrimSpace(os.Getenv("LDAP_USER_SEARCH_FILTER"))
	var filter string
	if userFilter != "" {
		filter = "(&" + userFilter + "(sAMAccountName=" + ldap.EscapeFilter(username) + "))"
	} else {
		filter = "(sAMAccountName=" + ldap.EscapeFilter(username) + ")"
	}
	bases := getSearchBases(ldapBaseDN)
	if len(bases) == 0 {
		bases = []string{ldapBaseDN}
	}

	var entry *ldap.Entry
	for _, base := range bases {
		searchReq := ldap.NewSearchRequest(
			base,
			ldap.ScopeWholeSubtree, ldap.NeverDerefAliases,
			1, // sizeLimit: нам достаточно 1 записи
			0, false,
			filter,
			[]string{"displayName", "mail", "department", "sAMAccountName", "thumbnailPhoto"},
			nil,
		)
		result, err := conn.Search(searchReq)
		if err != nil {
			return nil, err
		}
		if len(result.Entries) > 0 {
			entry = result.Entries[0]
			break
		}
	}
	if entry == nil {
		return nil, errors.New("user not found")
	}

	user := &UserResponse{
		Username: username,
	}

	if v := entry.GetAttributeValue("displayName"); v != "" {
		user.FullName = v
	} else {
		user.FullName = username
	}
	if v := entry.GetAttributeValue("mail"); v != "" {
		user.Email = v
	}
	if v := entry.GetAttributeValue("department"); v != "" {
		user.Dept = v
	}

	// Фото из thumbnailPhoto (JPEG)
	for _, attr := range entry.Attributes {
		if attr.Name == "thumbnailPhoto" && len(attr.ByteValues) > 0 {
			b64 := base64.StdEncoding.EncodeToString(attr.ByteValues[0])
			user.Photo = "data:image/jpeg;base64," + b64
			break
		}
	}

	return user, nil
}

func getMockUser(username string) *UserResponse {
	// Mock-данные для разработки / при недоступном AD
	mockUsers := map[string]*UserResponse{
		"batyanovskiygv": {
			FullName: "Батяновский Глеб Вадимович",
			Username: "BatyanovskiyGV",
			Email:    "BatyanovskiyGV@tep-m.ru",
			Dept:     "ИТ отдел",
			Photo:    "", // будет использоваться fallback с инициалами
		},
	}
	key := strings.ToLower(strings.TrimSpace(username))
	if u, ok := mockUsers[key]; ok {
		return u
	}
	return &UserResponse{
		FullName: username,
		Username: username,
		Email:    username + "@tep-m.ru",
		Dept:     "",
		Photo:    "",
	}
}

// ListADUsers — выгрузка пользователей AD (краткие поля). При недоступности AD — fallback.
func ListADUsers() ([]UserResponse, error) {
	ldapServer := os.Getenv("LDAP_SERVER")
	ldapUser := os.Getenv("LDAP_USER")
	ldapPassword := os.Getenv("LDAP_PASSWORD")
	ldapBaseDN := os.Getenv("LDAP_BASE_DN")
	if ldapServer == "" {
		ldapServer = os.Getenv("LDAP_HOST")
	}
	if ldapBaseDN == "" {
		ldapBaseDN = os.Getenv("LDAP_SEARCH_BASE")
	}
	// Если базы нет — попробуем вывести ее из LDAP_SERVER (пример: tep-m.ru -> DC=tep-m,DC=ru).
	if ldapBaseDN == "" && ldapServer != "" {
		host := strings.TrimSpace(ldapServer)
		host = strings.TrimPrefix(host, "ldap://")
		host = strings.TrimPrefix(host, "ldaps://")
		if i := strings.IndexByte(host, ':'); i >= 0 {
			host = host[:i]
		}
		labels := strings.FieldsFunc(host, func(r rune) bool { return r == '.' || r == ' ' || r == '\t' })
		if len(labels) >= 2 {
			parts := make([]string, 0, len(labels))
			for _, l := range labels {
				l = strings.TrimSpace(l)
				if l == "" {
					continue
				}
				parts = append(parts, "DC="+l)
			}
			ldapBaseDN = strings.Join(parts, ",")
		}
	}
	if ldapUser == "" {
		ldapUser = os.Getenv("LDAP_BIND_DN")
	}
	if ldapPassword == "" {
		ldapPassword = os.Getenv("LDAP_BIND_PASSWORD")
	}
	if ldapServer == "" || ldapBaseDN == "" {
		username := strings.TrimSpace(os.Getenv("AD_DEFAULT_USER"))
		if username == "" {
			username = "BatyanovskiyGV"
		}
		return []UserResponse{
			*getMockUser(username),
		}, nil
	}
	ldapURL := ldapServer
	if !strings.HasPrefix(ldapURL, "ldap://") && !strings.HasPrefix(ldapURL, "ldaps://") {
		ldapURL = "ldap://" + ldapServer + ":389"
	}
	conn, err := ldap.DialURL(ldapURL)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if err := tryBind(conn, ldapUser, ldapPassword, ldapServer); err != nil {
		return nil, err
	}
	// Используем фильтры как в другом проекте: сначала пробуем по baseDN,
	// если пусто — расширяемся обходом по OU.
	userFilter := strings.TrimSpace(os.Getenv("LDAP_USER_SEARCH_FILTER"))
	ouFilter := strings.TrimSpace(os.Getenv("LDAP_OU_SEARCH_FILTER"))
	if ouFilter == "" {
		ouFilter = "(objectClass=organizationalUnit)"
	}

	// Как в Kanboard/phonebook: отсекаем "лишнее", оставляя только пользователей,
	// у которых заполнен номер телефона (telephoneNumber=*).
	// Это резко уменьшает количество записей и соответствует логике из примера пользователя.
	phoneAttr := strings.TrimSpace(os.Getenv("LDAP_USER_PHONE_ATTRIBUTE"))
	if phoneAttr == "" {
		phoneAttr = "telephoneNumber"
	}
	requirePhone := true
	if v := strings.TrimSpace(os.Getenv("LDAP_REQUIRE_TELEPHONE_NUMBER")); v != "" {
		lv := strings.ToLower(v)
		requirePhone = !(lv == "0" || lv == "false" || lv == "no" || lv == "off")
	}

	bases := getSearchBases(ldapBaseDN)
	if len(bases) == 0 {
		bases = []string{ldapBaseDN}
	}
	restrictedBases := bases
	fullBases := []string{ldapBaseDN}

	searchUsersUnder := func(base string) ([]UserResponse, error) {
		parts := []string{"(sAMAccountName=*)"}
		if strings.TrimSpace(userFilter) != "" {
			uf := strings.TrimSpace(userFilter)
			if uf != "" {
				if !strings.HasPrefix(uf, "(") {
					uf = "(" + uf + ")"
				}
				parts = append(parts, uf)
			}
		}
		if requirePhone {
			p := strings.TrimSpace(phoneAttr)
			if p != "" {
				parts = append(parts, "(" + p + "=*)")
			}
		}

		filter := parts[0]
		if len(parts) > 1 {
			filter = "(&" + strings.Join(parts, "") + ")"
		}
		req := ldap.NewSearchRequest(
			base,
			ldap.ScopeWholeSubtree, ldap.NeverDerefAliases,
			1000, // sizeLimit: чтобы не падать на "Size Limit Exceeded"
			0,
			false,
			filter,
			[]string{"displayName", "mail", "department", "sAMAccountName"},
			nil,
		)
		res, err := conn.Search(req)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "size limit exceeded") {
				return []UserResponse{}, nil
			}
			return nil, err
		}
		outLocal := make([]UserResponse, 0, len(res.Entries))
		for _, e := range res.Entries {
			u := strings.TrimSpace(e.GetAttributeValue("sAMAccountName"))
			if u == "" {
				continue
			}
			full := strings.TrimSpace(e.GetAttributeValue("displayName"))
			if full == "" {
				full = u
			}
			outLocal = append(outLocal, UserResponse{
				FullName: full,
				Username: u,
				Email:    strings.TrimSpace(e.GetAttributeValue("mail")),
				Dept:     strings.TrimSpace(e.GetAttributeValue("department")),
			})
		}
		return outLocal, nil
	}

	outMap := map[string]UserResponse{}

	tryFill := func() {
		outMap = map[string]UserResponse{}
		// 1) Обходим OU и собираем пользователей (для каждого DN из LDAP_SEARCH_BASES).
		for _, base := range bases {
			ouReq := ldap.NewSearchRequest(
				base,
				ldap.ScopeWholeSubtree, ldap.NeverDerefAliases,
				2000, // sizeLimit для OU-списка
				0,
				false,
				ouFilter,
				[]string{},
				nil,
			)
			ouRes, err := conn.Search(ouReq)
			if err == nil {
				for _, ouEntry := range ouRes.Entries {
					ouDN := strings.TrimSpace(ouEntry.DN)
					if ouDN == "" {
						continue
					}
					users, err2 := searchUsersUnder(ouDN)
					if err2 != nil {
						continue
					}
					for _, u := range users {
						outMap[strings.ToLower(u.Username)] = u
					}
				}
			}
		}

		// 2) Если по OU ничего не нашли — пробуем напрямую по каждому base.
		if len(outMap) == 0 {
			for _, base := range bases {
				initial, err := searchUsersUnder(base)
				if err != nil {
					continue
				}
				for _, u := range initial {
					outMap[strings.ToLower(u.Username)] = u
				}
			}
		}
	}

	originalUserFilter := userFilter
	tryFill()
	// Если objectClass фильтр слишком жёсткий и даёт пусто — пробуем без него,
	// но всё равно оставляем OU-ограничение через LDAP_SEARCH_BASES.
	if len(outMap) == 0 && strings.TrimSpace(originalUserFilter) != "" {
		userFilter = ""
		tryFill()
	}

	// Если после LDAP_SEARCH_BASES всё равно пусто — возвращаемся к полному LDAP_BASE_DN,
	// чтобы не выдавать пустую админку (и не падать на мок).
	if len(outMap) == 0 && strings.TrimSpace(os.Getenv("LDAP_SEARCH_BASES")) != "" {
		bases = fullBases
		userFilter = originalUserFilter
		tryFill()
		if len(outMap) == 0 && strings.TrimSpace(originalUserFilter) != "" {
			userFilter = ""
			tryFill()
		}
		_ = restrictedBases
	}

	// 3) Финальный fallback, чтобы не возвращать пустой список.
	if len(outMap) == 0 {
		username := strings.TrimSpace(os.Getenv("AD_DEFAULT_USER"))
		if username == "" {
			username = "BatyanovskiyGV"
		}
		outMap[strings.ToLower(username)] = *getMockUser(username)
	}

	out := make([]UserResponse, 0, len(outMap))
	for _, u := range outMap {
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].FullName) < strings.ToLower(out[j].FullName)
	})
	return out, nil
}
