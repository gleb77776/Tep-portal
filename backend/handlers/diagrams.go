package handlers

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// GetDiagramsPath возвращает путь к папке диаграмм
func getDiagramsPath() string {
	path := os.Getenv("DIAGRAMS_PATH")
	if path == "" {
		path = "data/diagrams"
	}
	if !filepath.IsAbs(path) {
		cwd, _ := os.Getwd()
		path = filepath.Join(cwd, path)
		// Если backend запущен из backend/, ищем data в родительской папке
		if _, err := os.Stat(path); os.IsNotExist(err) {
			path = filepath.Join(cwd, "..", "data", "diagrams")
		}
	}
	return path
}

// ListDiagrams возвращает список проектов и их диаграмм
func ListDiagrams(c *gin.Context) {
	basePath := getDiagramsPath()
	if _, err := os.Stat(basePath); os.IsNotExist(err) {
		c.JSON(http.StatusOK, gin.H{"projects": []interface{}{}})
		return
	}

	entries, err := os.ReadDir(basePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	projects := []gin.H{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		projectDir := filepath.Join(basePath, e.Name())
		files, _ := os.ReadDir(projectDir)
		diagrams := []string{}
		for _, f := range files {
			if !f.IsDir() {
				diagrams = append(diagrams, f.Name())
			}
		}
		projects = append(projects, gin.H{
			"id":       e.Name(),
			"diagrams": diagrams,
		})
	}

	c.JSON(http.StatusOK, gin.H{"projects": projects})
}
