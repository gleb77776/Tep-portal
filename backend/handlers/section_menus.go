package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

var sectionMenusMu sync.RWMutex

func getSectionMenuPath(sectionID string) string {
	if strings.TrimSpace(sectionID) == "" {
		return ""
	}
	safe := strings.Map(func(r rune) rune {
		if r == '-' || r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, sectionID)
	if safe == "" {
		return ""
	}
	return filepath.Join(resolveDataDir(), "section_menus", safe+".json")
}

func saveSectionMenuItems(sectionID string, items []LicenseLink) error {
	p := getSectionMenuPath(sectionID)
	if p == "" {
		return os.ErrInvalid
	}
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func loadSectionMenuItems(sectionID string) ([]LicenseLink, error) {
	p := getSectionMenuPath(sectionID)
	if p == "" {
		return nil, os.ErrInvalid
	}
	data, err := os.ReadFile(p)
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

// ListSectionMenu — публичное меню ссылок для multi_links (кроме licenses — там отдельный API).
func ListSectionMenu(c *gin.Context) {
	sectionID := strings.TrimSpace(c.Param("sectionId"))
	if sectionID == "licenses" {
		ListLicensesLinks(c)
		return
	}
	sectionMenusMu.RLock()
	list, err := loadSectionMenuItems(sectionID)
	sectionMenusMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []LicenseLink{}
	}
	c.JSON(http.StatusOK, list)
}

// AdminPutSectionMenu — полная замена меню (как пакетное сохранение в админке).
func AdminPutSectionMenu(c *gin.Context) {
	sectionID := strings.TrimSpace(c.Param("sectionId"))
	if sectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sectionId required"})
		return
	}
	var items []LicenseLink
	if err := c.ShouldBindJSON(&items); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json array"})
		return
	}
	for _, it := range items {
		if msg, ok := validateLicenseLink(it.Title, it.URL); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
	}
	if sectionID == "licenses" {
		licensesLinksMu.Lock()
		defer licensesLinksMu.Unlock()
		if err := saveLicensesLinks(items); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	sectionMenusMu.Lock()
	defer sectionMenusMu.Unlock()
	if err := saveSectionMenuItems(sectionID, items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
