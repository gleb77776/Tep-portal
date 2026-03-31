package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

func dynamicSectionRoot(slug string) (string, bool) {
	sec, err := FindDynamicSectionBySlug(slug)
	if err != nil || sec == nil {
		return "", false
	}
	root := filepath.Join(resolveDataDir(), "site_sections", slug)
	return root, true
}

// ListDynamicDocs — список папок/файлов для шаблона documents / documents_video.
func ListDynamicDocs(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	basePath, ok := dynamicSectionRoot(slug)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown section"})
		return
	}
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
	c.JSON(http.StatusOK, gin.H{"path": relPath, "folders": folders, "files": files})
}

func AdminCreateDynamicFolder(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	basePath, ok := dynamicSectionRoot(slug)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown section"})
		return
	}
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите path и name"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if strings.Contains(req.Name, "..") || strings.ContainsAny(req.Name, "/\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимое имя папки"})
		return
	}
	if err := os.MkdirAll(basePath, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

func AdminUploadDynamicFile(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	basePath, ok := dynamicSectionRoot(slug)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown section"})
		return
	}
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
	if err := os.MkdirAll(basePath, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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

func AdminDeleteDynamicItem(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	basePath, ok := dynamicSectionRoot(slug)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown section"})
		return
	}
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

// ServeDynamicFile — отдача файлов из data/site_sections/:slug/
func ServeDynamicFile(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	fp := strings.TrimPrefix(c.Param("filepath"), "/")
	fp = strings.TrimPrefix(fp, "\\")
	basePath, ok := dynamicSectionRoot(slug)
	if !ok {
		c.Status(http.StatusNotFound)
		return
	}
	fullPath, ok := safeJoin(basePath, fp)
	if !ok {
		c.Status(http.StatusBadRequest)
		return
	}
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		c.Status(http.StatusNotFound)
		return
	}
	c.File(fullPath)
}
