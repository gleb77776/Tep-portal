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

// Ключи карточек главной: заявка IT, TEP-WIKI, СКУД, СПРУТ
var sectionCardLinkKeys = map[string]bool{
	"it": true, "wiki": true, "skud": true, "sprut": true,
}

var sectionCardLinksMu sync.RWMutex

func defaultSectionCardLinks() map[string]string {
	return map[string]string{
		"it":    "http://tepmapp12/inframanager/SD/ServiceCatalogue",
		"wiki":  "http://tepmapp25:5003/doku.php?id=start",
		"skud":  "file://tep-m.ru/data/App/TimeSheet/skud/skud.run.cmd",
		"sprut": "file://tep-m.ru/data/App/TimeSheet/sprut/sprut.run.cmd",
	}
}

func getSectionCardLinksPath() string {
	path := os.Getenv("SECTION_CARD_LINKS_PATH")
	if path == "" {
		cwd, _ := os.Getwd()
		for _, p := range []string{
			filepath.Join(cwd, "data", "section_card_links.json"),
			filepath.Join(cwd, "..", "data", "section_card_links.json"),
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
		path = filepath.Join(cwd, "data", "section_card_links.json")
	}
	return path
}

func loadSectionCardLinks() (map[string]string, error) {
	p := getSectionCardLinksPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultSectionCardLinks(), nil
		}
		return nil, err
	}
	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	out := defaultSectionCardLinks()
	for k, v := range m {
		if sectionCardLinkKeys[k] && strings.TrimSpace(v) != "" {
			out[k] = strings.TrimSpace(v)
		}
	}
	return out, nil
}

func saveSectionCardLinks(m map[string]string) error {
	p := getSectionCardLinksPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func validateSectionCardURL(u string) (string, bool) {
	s := strings.TrimSpace(u)
	if s == "" {
		return "url required", false
	}
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") && !strings.HasPrefix(s, "file://") {
		return "url must start with http(s):// or file://", false
	}
	return "", true
}

// ListSectionCardLinks — публичная выдача ссылок для карточек главной.
func ListSectionCardLinks(c *gin.Context) {
	sectionCardLinksMu.RLock()
	m, err := loadSectionCardLinks()
	sectionCardLinksMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, m)
}

// AdminPutSectionCardLink — заменить ссылку для ключа it|wiki|skud|sprut.
func AdminPutSectionCardLink(c *gin.Context) {
	key := strings.TrimSpace(c.Param("key"))
	if !sectionCardLinkKeys[key] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown key"})
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if msg, ok := validateSectionCardURL(body.URL); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	sectionCardLinksMu.Lock()
	defer sectionCardLinksMu.Unlock()

	m, err := loadSectionCardLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	m[key] = strings.TrimSpace(body.URL)
	if err := saveSectionCardLinks(m); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "key": key, "url": m[key]})
}
