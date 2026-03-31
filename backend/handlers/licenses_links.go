package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

// LicenseLink — пункт меню раздела «Лицензии, программы» (название + URL).
type LicenseLink struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

var licensesLinksMu sync.RWMutex

const maxLicenseLinks = 100

func getLicensesLinksPath() string {
	path := os.Getenv("LICENSES_LINKS_PATH")
	if path == "" {
		cwd, _ := os.Getwd()
		for _, p := range []string{
			filepath.Join(cwd, "data", "licenses_links.json"),
			filepath.Join(cwd, "..", "data", "licenses_links.json"),
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
		path = filepath.Join(cwd, "data", "licenses_links.json")
	}
	return path
}

func loadLicensesLinks() ([]LicenseLink, error) {
	data, err := os.ReadFile(getLicensesLinksPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []LicenseLink{}, nil
		}
		return nil, err
	}
	var list []LicenseLink
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func saveLicensesLinks(list []LicenseLink) error {
	p := getLicensesLinksPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func validateLicenseLink(title, url string) (string, bool) {
	if strings.TrimSpace(title) == "" {
		return "title required", false
	}
	u := strings.TrimSpace(url)
	if u == "" {
		return "url required", false
	}
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "file://") {
		return "url must start with http(s):// or file://", false
	}
	return "", true
}

// ListLicensesLinks — публичная выдача меню раздела «Лицензии, программы».
func ListLicensesLinks(c *gin.Context) {
	licensesLinksMu.RLock()
	list, err := loadLicensesLinks()
	licensesLinksMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []LicenseLink{}
	}
	c.JSON(http.StatusOK, list)
}

// AdminCreateLicenseLink — добавить пункт меню.
func AdminCreateLicenseLink(c *gin.Context) {
	var body struct {
		Title string `json:"title"`
		URL   string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if msg, ok := validateLicenseLink(body.Title, body.URL); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	licensesLinksMu.Lock()
	defer licensesLinksMu.Unlock()
	list, err := loadLicensesLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(list) >= maxLicenseLinks {
		c.JSON(http.StatusBadRequest, gin.H{"error": "links limit reached"})
		return
	}
	maxID := 0
	for _, it := range list {
		if it.ID > maxID {
			maxID = it.ID
		}
	}
	item := LicenseLink{ID: maxID + 1, Title: strings.TrimSpace(body.Title), URL: strings.TrimSpace(body.URL)}
	list = append(list, item)
	if err := saveLicensesLinks(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

// AdminUpdateLicenseLink — изменить пункт.
func AdminUpdateLicenseLink(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Title string `json:"title"`
		URL   string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if msg, ok := validateLicenseLink(body.Title, body.URL); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	licensesLinksMu.Lock()
	defer licensesLinksMu.Unlock()
	list, err := loadLicensesLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range list {
		if list[i].ID == id {
			list[i].Title = strings.TrimSpace(body.Title)
			list[i].URL = strings.TrimSpace(body.URL)
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := saveLicensesLinks(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// AdminDeleteLicenseLink — удалить пункт.
func AdminDeleteLicenseLink(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	licensesLinksMu.Lock()
	defer licensesLinksMu.Unlock()
	list, err := loadLicensesLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	newList := make([]LicenseLink, 0, len(list))
	for _, it := range list {
		if it.ID != id {
			newList = append(newList, it)
		}
	}
	if len(newList) == len(list) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := saveLicensesLinks(newList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// AdminReorderLicenseLinks — порядок пунктов меню.
func AdminReorderLicenseLinks(c *gin.Context) {
	var body struct {
		IDs []int `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	licensesLinksMu.Lock()
	defer licensesLinksMu.Unlock()
	list, err := loadLicensesLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byID := make(map[int]LicenseLink)
	for _, it := range list {
		byID[it.ID] = it
	}
	used := make(map[int]bool)
	newList := make([]LicenseLink, 0, len(list))
	for _, id := range body.IDs {
		if used[id] {
			continue
		}
		if it, ok := byID[id]; ok {
			newList = append(newList, it)
			used[id] = true
		}
	}
	for _, it := range list {
		if !used[it.ID] {
			newList = append(newList, it)
		}
	}
	if err := saveLicensesLinks(newList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
