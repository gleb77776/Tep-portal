package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

func getSMKPath() string {
	path := os.Getenv("SMK_PATH")
	if path == "" {
		path = "data/smk"
	}
	if !filepath.IsAbs(path) {
		cwd, _ := os.Getwd()
		path = filepath.Join(cwd, path)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			path = filepath.Join(cwd, "..", "data", "smk")
		}
	}
	return path
}

// isSubpath проверяет, что target находится внутри base (надёжно на Windows: регистр, кириллица).
// Не используем filepath.Rel — на части конфигураций Windows он возвращает ошибку для путей с юникодом.
func isSubpath(baseAbs, targetAbs string) bool {
	b, err1 := filepath.Abs(baseAbs)
	t, err2 := filepath.Abs(targetAbs)
	if err1 != nil || err2 != nil {
		return false
	}
	b = filepath.Clean(b)
	t = filepath.Clean(t)
	if b == t {
		return true
	}
	sep := string(filepath.Separator)
	bl := strings.ToLower(b)
	tl := strings.ToLower(t)
	if !strings.HasSuffix(bl, sep) {
		bl += sep
	}
	return strings.HasPrefix(tl, bl)
}

// safeJoin проверяет, что путь не выходит за пределы basePath (защита от path traversal)
func safeJoin(base, rel string) (string, bool) {
	rel = filepath.Clean(rel)
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	full := filepath.Join(base, rel)
	if !isSubpath(base, full) {
		return "", false
	}
	return full, true
}

// ListSMK возвращает содержимое папки: подпапки и файлы
func ListSMK(c *gin.Context) {
	basePath := getSMKPath()
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

// CreateSMKFolder создаёт папку в СМК. Только для ИТ, ИСУП, Руководство (проверка через AD).
func CreateSMKFolder(c *gin.Context) {
	user := GetUserFromRequest(c)
	if !CanManageSMK(user.Dept) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Недостаточно прав. Доступ: ИТ, ИСУП, Руководство."})
		return
	}

	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите path и name"})
		return
	}

	// Запрет небезопасных имён
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || strings.Contains(req.Name, "..") || strings.ContainsAny(req.Name, "/\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимое имя папки"})
		return
	}

	basePath := getSMKPath()
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

// UploadSMKFile загружает файл в папку СМК. Только для ИТ, ИСУП, Руководство (проверка через AD).
func UploadSMKFile(c *gin.Context) {
	user := GetUserFromRequest(c)
	if !CanManageSMK(user.Dept) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Недостаточно прав. Доступ: ИТ, ИСУП, Руководство."})
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

	basePath := getSMKPath()
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

// --- Админ-панель: те же операции без проверки отдела (только RequireAdmin) ---

func AdminCreateSMKFolder(c *gin.Context) {
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

	basePath := getSMKPath()
	if err := os.MkdirAll(basePath, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать каталог СМК: " + err.Error()})
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

func AdminUploadSMKFile(c *gin.Context) {
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

	basePath := getSMKPath()
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

// AdminDeleteSMKItem удаляет файл или папку по относительному пути от корня СМК.
// Query: path=relative/path (или path=file.pdf в корне)
func AdminDeleteSMKItem(c *gin.Context) {
	rel := strings.TrimSpace(c.Query("path"))
	if rel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите path"})
		return
	}
	// Нормализуем: Windows/Unix
	rel = filepath.Clean(rel)
	if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимый путь"})
		return
	}

	basePath := getSMKPath()
	fullPath, ok := safeJoin(basePath, rel)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	baseAbs, _ := filepath.Abs(basePath)
	fullAbs, _ := filepath.Abs(fullPath)
	if fullAbs == baseAbs {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя удалить корень СМК"})
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
