package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	RoleAdmin         = "administrator"
	RoleDocumentation = "documentation"
	RoleHR            = "hr"
	RoleEmployee      = "employee"
	// Редактор главной: только новости и полезные ссылки в админке.
	RoleNewsLinks = "news_links"
	// Безопасник: только раздел «Охрана труда, ГО и ЧС» (/ohs) в админке.
	RoleSafety = "safety"
)

type AccessInfo struct {
	Username            string   `json:"username"`
	Role                string   `json:"role"`
	CanAccessAdmin      bool     `json:"canAccessAdmin"`
	CanManageUsers      bool     `json:"canManageUsers"`
	CanEditNewsAndLinks bool     `json:"canEditNewsAndLinks"`
	CanEditOT           bool     `json:"canEditOT"`
	Permissions         []string `json:"permissions"`
	AllowedSectionKey   string   `json:"allowedSectionKey,omitempty"`
}

func getRolesPath() string {
	cwd, _ := os.Getwd()
	for _, p := range []string{
		filepath.Join(cwd, "data", "user_roles.json"),
		filepath.Join(cwd, "..", "data", "user_roles.json"),
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return filepath.Join(cwd, "data", "user_roles.json")
}

func normalizeUsername(u string) string {
	u = strings.TrimSpace(strings.ToLower(u))
	if i := strings.IndexByte(u, '@'); i > 0 {
		u = u[:i]
	}
	// Бывает, что в заголовках приходит `batanovskiy.gv` (с точкой),
	// а в AD sAMAccountName `BatyanovskiyGV` (без точки).
	u = strings.ReplaceAll(u, ".", "")
	// Ещё один частый кейс: путают "batanovskiy" / "batyanovskiy".
	u = strings.ReplaceAll(u, "batanovskiy", "batyanovskiy")
	return u
}

func normalizeRole(role string) string {
	r := strings.TrimSpace(strings.ToLower(role))
	r = strings.ReplaceAll(r, "-", "_")
	switch r {
	case RoleAdmin:
		return RoleAdmin
	case RoleDocumentation:
		return RoleDocumentation
	case RoleHR:
		return RoleHR
	case RoleNewsLinks, "newslinks":
		return RoleNewsLinks
	case RoleSafety, "ohs", "ot_go_chs":
		return RoleSafety
	default:
		return RoleEmployee
	}
}

func getRoleForUsername(username string) (string, error) {
	un := normalizeUsername(username)
	if r, ok, err := roleStore.Get(un); err != nil {
		return RoleEmployee, err
	} else if ok {
		return normalizeRole(r), nil
	}
	allMap, err := roleStore.All()
	if err != nil {
		return RoleEmployee, err
	}
	// Если роли ещё не настроены (файла/таблицы нет или пусто), даём дефолт только конкретному пользователю для дебага.
	rolesPath := getRolesPath()
	if _, statErr := os.Stat(rolesPath); statErr != nil || len(allMap) == 0 {
		if un == normalizeUsername("BatyanovskiyGV") {
			return RoleAdmin, nil
		}
	}
	bootstrap := normalizeUsername(os.Getenv("BOOTSTRAP_ADMIN_USER"))
	if bootstrap == "" {
		bootstrap = normalizeUsername(os.Getenv("AD_DEFAULT_USER"))
	}
	// Если вообще не настроено, разрешаем dev/default пользователю только когда LDAP не настроен.
	if bootstrap == "" {
		ldapServer := os.Getenv("LDAP_SERVER")
		if ldapServer == "" {
			ldapServer = os.Getenv("LDAP_HOST")
		}
		ldapBaseDN := os.Getenv("LDAP_BASE_DN")
		if ldapBaseDN == "" {
			ldapBaseDN = os.Getenv("LDAP_SEARCH_BASE")
		}
		if ldapServer == "" || ldapBaseDN == "" {
			bootstrap = normalizeUsername("BatyanovskiyGV")
		}
	}
	if bootstrap != "" && un == bootstrap {
		return RoleAdmin, nil
	}
	return RoleEmployee, nil
}

func rolePermissions(role string) []string {
	switch normalizeRole(role) {
	case RoleAdmin:
		return []string{"admin:*", "users:read", "users:write"}
	case RoleDocumentation:
		return []string{"admin:sections", "documents:upload", "documents:no-delete"}
	case RoleHR:
		return []string{"admin:sections", "forms:upload", "forms:delete"}
	case RoleNewsLinks:
		return []string{"admin:news", "admin:links"}
	case RoleSafety:
		return []string{"admin:ot"}
	default:
		return []string{}
	}
}

// Slug раздела «Архивные проекты» (scoped projects в админке). Переопределение: DOCUMENTATION_SCOPED_PROJECTS_SLUG
func documentationScopedProjectsSlug() string {
	if v := strings.TrimSpace(os.Getenv("DOCUMENTATION_SCOPED_PROJECTS_SLUG")); v != "" {
		return strings.ToLower(v)
	}
	return "arkhiv"
}

// Slug динамического раздела «СРО». Переопределение: DOCUMENTATION_DYNAMIC_DOCS_SLUG
func documentationDynamicDocsSlug() string {
	if v := strings.TrimSpace(os.Getenv("DOCUMENTATION_DYNAMIC_DOCS_SLUG")); v != "" {
		return strings.ToLower(v)
	}
	return "sro"
}

// RequireAdministrator — только полный администратор.
// RequireAdminOrDocumentation — проекты (основные), СМК, КЭПР: загрузка без удаления (удаление — отдельные роуты с RequireAdministrator).
func RequireAdminOrDocumentation(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role == RoleAdmin || info.Role == RoleDocumentation {
		c.Next()
		return
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

// RequireScopedProjectsForDocumentation — админ или «Документация» только для slug архивных проектов.
func RequireScopedProjectsForDocumentation(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role == RoleAdmin {
		c.Next()
		return
	}
	if info.Role == RoleDocumentation {
		slug := strings.TrimSpace(c.Param("slug"))
		if strings.EqualFold(slug, documentationScopedProjectsSlug()) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "documentation may edit only scoped archive projects"})
		return
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

// RequireAdministratorOrDocumentationDynamicSRO — папки в динамическом разделе: админ везде, документация только в СРО (slug).
func RequireAdministratorOrDocumentationDynamicSRO(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role == RoleAdmin {
		c.Next()
		return
	}
	if info.Role == RoleDocumentation {
		slug := strings.TrimSpace(c.Param("slug"))
		if strings.EqualFold(slug, documentationDynamicDocsSlug()) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

func buildAccessInfo(c *gin.Context) (AccessInfo, error) {
	u := GetUserFromRequest(c)
	username := ""
	if u != nil {
		username = u.Username
	}
	role, err := getRoleForUsername(username)
	if err != nil {
		return AccessInfo{}, err
	}
	// Явный список: любая неизвестная роль = employee без админки.
	canAdmin := role == RoleAdmin || role == RoleDocumentation || role == RoleHR || role == RoleNewsLinks || role == RoleSafety
	info := AccessInfo{
		Username:            username,
		Role:                role,
		CanAccessAdmin:      canAdmin,
		CanManageUsers:      role == RoleAdmin,
		CanEditNewsAndLinks: role == RoleAdmin || role == RoleNewsLinks,
		CanEditOT:           role == RoleAdmin || role == RoleSafety,
		Permissions:         rolePermissions(role),
	}
	if role == RoleDocumentation {
		info.AllowedSectionKey = "documents"
	} else if role == RoleHR {
		info.AllowedSectionKey = "forms"
	}
	return info, nil
}

// Совместимость со старым фронтом: логин/пароль больше не используются.
func AdminLogin(c *gin.Context) {
	info, err := buildAccessInfo(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !info.CanAccessAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "token": "ad-session", "access": info})
}

func GetAdminAccess(c *gin.Context) {
	info, err := buildAccessInfo(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, info)
}

func requireRole(c *gin.Context) (AccessInfo, bool) {
	info, err := buildAccessInfo(c)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return AccessInfo{}, false
	}
	c.Set("access_info", info)
	return info, true
}

func RequireAdmin(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if !info.CanAccessAdmin {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	c.Next()
}

func RequireAdministrator(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role != RoleAdmin {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "administrator role required"})
		return
	}
	c.Next()
}

func RequireDocumentationUploader(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role == RoleAdmin {
		c.Next()
		return
	}
	if info.Role != RoleDocumentation {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "not allowed"})
		return
	}
	slug := strings.TrimSpace(c.Param("slug"))
	if !strings.EqualFold(slug, documentationDynamicDocsSlug()) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "documentation may upload only in configured SRO section"})
		return
	}
	c.Next()
}

func RequireFormsEditor(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role != RoleAdmin && info.Role != RoleHR {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "not allowed"})
		return
	}
	c.Next()
}

// RequireNewsLinksEditor — администратор или редактор новостей/ссылок.
func RequireNewsLinksEditor(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role == RoleAdmin || info.Role == RoleNewsLinks {
		c.Next()
		return
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

// RequireAdminOrSafetyOT — администратор или роль «безопасник» (ОТ, ГО и ЧС).
func RequireAdminOrSafetyOT(c *gin.Context) {
	info, ok := requireRole(c)
	if !ok {
		return
	}
	if info.Role == RoleAdmin || info.Role == RoleSafety {
		c.Next()
		return
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}
