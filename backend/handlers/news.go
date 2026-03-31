package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

type NewsItem struct {
	ID    int     `json:"id"`
	Icon  string  `json:"icon"`
	Title string  `json:"title"`
	Date  string  `json:"date"`
	Badge *string `json:"badge,omitempty"`
}

var newsMu sync.RWMutex

const maxNewsTitleLen = 500

func validateNewsTitle(title string) (string, bool) {
	if title == "" {
		return "title required", false
	}
	if utf8.RuneCountInString(title) > maxNewsTitleLen {
		return "title too long (max 500)", false
	}
	return "", true
}

func getNewsPath() string {
	path := os.Getenv("NEWS_DATA_PATH")
	if path == "" {
		cwd, _ := os.Getwd()
		path = filepath.Join(cwd, "data", "news.json")
		if _, err := os.Stat(path); os.IsNotExist(err) {
			path = filepath.Join(cwd, "..", "data", "news.json")
		}
	}
	return path
}

func loadNews() ([]NewsItem, error) {
	data, err := os.ReadFile(getNewsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []NewsItem{}, nil
		}
		return nil, err
	}
	var list []NewsItem
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func saveNews(list []NewsItem) error {
	p := getNewsPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func ListNews(c *gin.Context) {
	newsMu.RLock()
	list, err := loadNews()
	newsMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []NewsItem{}
	}
	c.JSON(http.StatusOK, list)
}

func CreateNews(c *gin.Context) {
	var body struct {
		Icon  string  `json:"icon"`
		Title string  `json:"title"`
		Date  string  `json:"date"`
		Badge *string `json:"badge,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateNewsTitle(body.Title); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	newsMu.Lock()
	defer newsMu.Unlock()
	list, err := loadNews()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	maxID := 0
	for _, n := range list {
		if n.ID > maxID {
			maxID = n.ID
		}
	}
	item := NewsItem{ID: maxID + 1, Icon: body.Icon, Title: body.Title, Date: body.Date, Badge: body.Badge}
	list = append([]NewsItem{item}, list...)
	if err := saveNews(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

func UpdateNews(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Icon  string  `json:"icon"`
		Title string  `json:"title"`
		Date  string  `json:"date"`
		Badge *string `json:"badge,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateNewsTitle(body.Title); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	newsMu.Lock()
	defer newsMu.Unlock()
	list, err := loadNews()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range list {
		if list[i].ID == id {
			list[i].Icon = body.Icon
			list[i].Title = body.Title
			list[i].Date = body.Date
			list[i].Badge = body.Badge
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "news not found"})
		return
	}
	if err := saveNews(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ReorderNews(c *gin.Context) {
	var body struct {
		IDs []int `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	newsMu.Lock()
	defer newsMu.Unlock()
	list, err := loadNews()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byID := make(map[int]NewsItem, len(list))
	for _, n := range list {
		byID[n.ID] = n
	}
	used := make(map[int]bool)
	newList := make([]NewsItem, 0, len(list))
	for _, id := range body.IDs {
		if used[id] {
			continue
		}
		if n, ok := byID[id]; ok {
			newList = append(newList, n)
			used[id] = true
		}
	}
	for _, n := range list {
		if !used[n.ID] {
			newList = append(newList, n)
		}
	}
	if err := saveNews(newList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteNews(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	newsMu.Lock()
	defer newsMu.Unlock()
	list, err := loadNews()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	newList := make([]NewsItem, 0, len(list))
	for _, n := range list {
		if n.ID != id {
			newList = append(newList, n)
		}
	}
	if len(newList) == len(list) {
		c.JSON(http.StatusNotFound, gin.H{"error": "news not found"})
		return
	}
	if err := saveNews(newList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
