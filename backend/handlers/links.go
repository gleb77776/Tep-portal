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

type UsefulLink struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

var linksMu sync.RWMutex
const maxUsefulLinks = 13

var defaultLinks = []UsefulLink{
	{ID: 1, Name: "Внешний сайт ТЭП", URL: "https://www.tep.ru"},
	{ID: 2, Name: "Телефонный справочник АО \"ТЭК Мосэнерго\"", URL: "https://www.mosenergo.ru"},
	{ID: 3, Name: "Телефонный справочник Эннова", URL: "https://www.enova.ru"},
	{ID: 4, Name: "Трест Гидромонтаж", URL: "https://www.gidromontage.ru"},
	{ID: 5, Name: "Сбербанк России", URL: "https://sberbank.ru"},
	{ID: 6, Name: "Банк Тинькофф", URL: "https://www.tinkoff.ru"},
	{ID: 7, Name: "Пробки на Яндекс.Картах", URL: "https://yandex.ru/maps/?l=trf"},
	{ID: 8, Name: "ЯндексРасписание", URL: "https://rasp.yandex.ru"},
	{ID: 9, Name: "Переводчик Google", URL: "https://translate.google.com"},
	{ID: 10, Name: "Переводчик Промт", URL: "https://www.online-translator.com"},
	{ID: 11, Name: "Шаблоны проектной документации", URL: "file://tep-m.ru/data/Шаблоны/"},
	{ID: 12, Name: "Фотографии с ЧГК", URL: "file://tep-m.ru/data/Фото/ЧГК/"},
}

func getLinksPath() string {
	path := os.Getenv("LINKS_DATA_PATH")
	if path == "" {
		cwd, _ := os.Getwd()
		for _, p := range []string{filepath.Join(cwd, "data", "links.json"), filepath.Join(cwd, "..", "data", "links.json")} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
		path = filepath.Join(cwd, "data", "links.json")
	}
	return path
}

func loadLinks() ([]UsefulLink, error) {
	data, err := os.ReadFile(getLinksPath())
	if err != nil {
		if os.IsNotExist(err) {
			return append([]UsefulLink{}, defaultLinks...), nil
		}
		return nil, err
	}
	var list []UsefulLink
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func saveLinks(list []UsefulLink) error {
	p := getLinksPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func validateLink(name, url string) (string, bool) {
	if strings.TrimSpace(name) == "" {
		return "name required", false
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

func ListLinks(c *gin.Context) {
	linksMu.RLock()
	list, err := loadLinks()
	linksMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []UsefulLink{}
	}
	c.JSON(http.StatusOK, list)
}

func CreateLink(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateLink(body.Name, body.URL); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	linksMu.Lock()
	defer linksMu.Unlock()
	list, err := loadLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(list) >= maxUsefulLinks {
		c.JSON(http.StatusBadRequest, gin.H{"error": "links limit reached (max 13)"})
		return
	}
	maxID := 0
	for _, it := range list {
		if it.ID > maxID {
			maxID = it.ID
		}
	}
	item := UsefulLink{ID: maxID + 1, Name: strings.TrimSpace(body.Name), URL: strings.TrimSpace(body.URL)}
	list = append([]UsefulLink{item}, list...)
	if err := saveLinks(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

func UpdateLink(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateLink(body.Name, body.URL); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	linksMu.Lock()
	defer linksMu.Unlock()
	list, err := loadLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range list {
		if list[i].ID == id {
			list[i].Name = strings.TrimSpace(body.Name)
			list[i].URL = strings.TrimSpace(body.URL)
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}
	if err := saveLinks(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteLink(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	linksMu.Lock()
	defer linksMu.Unlock()
	list, err := loadLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	newList := make([]UsefulLink, 0, len(list))
	for _, it := range list {
		if it.ID != id {
			newList = append(newList, it)
		}
	}
	if len(newList) == len(list) {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}
	if err := saveLinks(newList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ReorderLinks(c *gin.Context) {
	var body struct {
		IDs []int `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	linksMu.Lock()
	defer linksMu.Unlock()
	list, err := loadLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byID := make(map[int]UsefulLink)
	for _, it := range list {
		byID[it.ID] = it
	}
	used := make(map[int]bool)
	newList := make([]UsefulLink, 0, len(list))
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
	if err := saveLinks(newList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
