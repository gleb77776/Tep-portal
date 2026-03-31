package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// getOTPath — корень файлов раздела «Охрана труда, ГО и ЧС» (отдельно от СМК).
func getOTPath() string {
	path := os.Getenv("OT_DOCS_PATH")
	if path == "" {
		path = "data/ot_go_chs"
	}
	if !filepath.IsAbs(path) {
		cwd, _ := os.Getwd()
		path = filepath.Join(cwd, path)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			path = filepath.Join(cwd, "..", "data", "ot_go_chs")
		}
	}
	return path
}

// ListOT — список папок и файлов (публичное чтение для сайта).
func ListOT(c *gin.Context) {
	basePath := getOTPath()
	relPath := c.Query("path")
	if relPath == "" {
		relPath = "."
	}

	fullPath, ok := safeJoin(basePath, relPath)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"path": relPath, "folders": []gin.H{}, "files": []gin.H{}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a directory"})
		return
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	folders := []gin.H{}
	files := []gin.H{}

	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if e.IsDir() {
			folders = append(folders, gin.H{"name": name})
		} else {
			ext := strings.ToLower(filepath.Ext(name))
			files = append(files, gin.H{"name": name, "ext": ext})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"path":    relPath,
		"folders": folders,
		"files":   files,
	})
}

func AdminCreateOTFolder(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите path и name"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || strings.Contains(req.Name, "..") || strings.ContainsAny(req.Name, "/\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимое имя папки"})
		return
	}

	basePath := getOTPath()
	if err := os.MkdirAll(basePath, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать каталог раздела: " + err.Error()})
		return
	}
	relPath := req.Path
	if relPath == "" {
		relPath = "."
	}
	fullPath, ok := safeJoin(basePath, relPath)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	newDir := filepath.Join(fullPath, req.Name)
	if !isSubpath(basePath, newDir) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	if err := os.MkdirAll(newDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "path": filepath.Join(relPath, req.Name)})
}

func AdminUploadOTFile(c *gin.Context) {
	path := c.PostForm("path")
	if path == "" {
		path = "."
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Файл не указан"})
		return
	}

	filename := filepath.Base(file.Filename)
	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимое имя файла"})
		return
	}

	basePath := getOTPath()
	fullPath, ok := safeJoin(basePath, path)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || !info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Папка не найдена"})
		return
	}

	dest := filepath.Join(fullPath, filename)
	if err := c.SaveUploadedFile(file, dest); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "name": filename})
}

func AdminDeleteOTItem(c *gin.Context) {
	rel := strings.TrimSpace(c.Query("path"))
	if rel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите path"})
		return
	}
	rel = filepath.Clean(rel)
	if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимый путь"})
		return
	}

	basePath := getOTPath()
	fullPath, ok := safeJoin(basePath, rel)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	baseAbs, _ := filepath.Abs(basePath)
	fullAbs, _ := filepath.Abs(fullPath)
	if fullAbs == baseAbs {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя удалить корень каталога раздела"})
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "не найдено"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if info.IsDir() {
		if err := os.RemoveAll(fullPath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		if err := os.Remove(fullPath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
