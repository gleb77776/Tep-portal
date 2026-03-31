package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"mime/multipart"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type AdminProject struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Visible   bool   `json:"visible"`
	Author    string `json:"author,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
	Source    string `json:"source"` // "diagrams" | "admin"
}

type ProjectDocument struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Ext       string `json:"ext"`
	Url       string `json:"url"`
	AddedBy   string `json:"addedBy"`
	AddedAt   string `json:"addedAt"`
	Source    string `json:"source"` // "admin" | "diagrams"
}

var projectsMu sync.RWMutex

const (
	projectMetaFileEnv      = "PROJECTS_META_PATH"
	projectDocsMetaFileEnv = "PROJECT_DOCS_META_PATH"
	projectFilesRootEnv    = "PROJECT_DOCS_FILES_PATH"
)

type projectsMeta struct {
	Projects []AdminProject       `json:"projects"`
	DocsByPrj map[string][]adminDocMeta `json:"docsByProject"`
}

type adminDocMeta struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Ext     string `json:"ext"`
	File    string `json:"file"` // stored filename
	AddedBy string `json:"addedBy"`
	AddedAt string `json:"addedAt"`
}

func getDiagramsPathForProjects() string {
	path := os.Getenv("DIAGRAMS_PATH")
	if path == "" {
		path = "data/diagrams"
	}
	if !filepath.IsAbs(path) {
		cwd, _ := os.Getwd()
		path = filepath.Join(cwd, path)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			path = filepath.Join(cwd, "..", "data", "diagrams")
		}
	}
	return path
}

func getProjectsMetaPath() string {
	if p := os.Getenv(projectMetaFileEnv); p != "" {
		return p
	}
	cwd, _ := os.Getwd()
	candidate := filepath.Join(cwd, "data", "projects_admin.json")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return filepath.Join(cwd, "..", "data", "projects_admin.json")
}

func getProjectDocsMetaPath() string {
	if p := os.Getenv(projectDocsMetaFileEnv); p != "" {
		return p
	}
	cwd, _ := os.Getwd()
	candidate := filepath.Join(cwd, "data", "project_docs_admin.json")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return filepath.Join(cwd, "..", "data", "project_docs_admin.json")
}

func getProjectFilesRoot() string {
	if p := os.Getenv(projectFilesRootEnv); p != "" {
		return p
	}
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, "..", "data", "project_files_admin")
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0755)
}

func newID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func slugify(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "_", "-")
	// Разрешаем только a-z, A-Z, 0-9 и дефис
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteRune('-')
		}
	}
	out := b.String()
	out = strings.Trim(out, "-")
	if out == "" {
		return ""
	}
	return out
}

func readJSONFile(path string, dst any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dst)
}

func writeJSONFile(path string, v any) error {
	if err := ensureDir(filepath.Dir(path)); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func loadAdminProjects() ([]AdminProject, error) {
	path := getProjectsMetaPath()
	var wrap struct {
		Projects []AdminProject `json:"projects"`
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return []AdminProject{}, nil
	}
	if err := readJSONFile(path, &wrap); err != nil {
		return nil, err
	}
	if wrap.Projects == nil {
		return []AdminProject{}, nil
	}
	return wrap.Projects, nil
}

func saveAdminProjects(list []AdminProject) error {
	return writeJSONFile(getProjectsMetaPath(), map[string]any{"projects": list})
}

func loadAdminDocs() (map[string][]adminDocMeta, error) {
	path := getProjectDocsMetaPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return map[string][]adminDocMeta{}, nil
	}
	var wrap struct {
		DocsByProject map[string][]adminDocMeta `json:"docsByProject"`
	}
	if err := readJSONFile(path, &wrap); err != nil {
		return nil, err
	}
	if wrap.DocsByProject == nil {
		return map[string][]adminDocMeta{}, nil
	}
	return wrap.DocsByProject, nil
}

func saveAdminDocs(docs map[string][]adminDocMeta) error {
	return writeJSONFile(getProjectDocsMetaPath(), map[string]any{"docsByProject": docs})
}

func listDiagramsProjects() (map[string]bool, error) {
	basePath := getDiagramsPathForProjects()
	if _, err := os.Stat(basePath); os.IsNotExist(err) {
		return map[string]bool{}, nil
	}
	entries, err := os.ReadDir(basePath)
	if err != nil {
		return nil, err
	}
	out := map[string]bool{}
	for _, e := range entries {
		if e.IsDir() {
			out[e.Name()] = true
		}
	}
	return out, nil
}

func buildAdminProjectMap() (map[string]AdminProject, map[string]bool, error) {
	diagrams, err := listDiagramsProjects()
	if err != nil {
		return nil, nil, err
	}
	adminProjects, err := loadAdminProjects()
	if err != nil {
		return nil, nil, err
	}
	mp := map[string]AdminProject{}
	for _, p := range adminProjects {
		mp[p.ID] = p
	}
	// Добавляем проекты из diagrams, если их нет в meta
	for id := range diagrams {
		if _, ok := mp[id]; ok {
			// Если admin проект есть — оставляем его title/author/source
			continue
		}
		mp[id] = AdminProject{
			ID:       id,
			Title:    getDiagramProjectTitle(id),
			Visible:  true,
			Source:   "diagrams",
		}
	}
	return mp, diagrams, nil
}

// getDiagramProjectTitle переводит "имя папки" из data/diagrams (например "68N115_YAC")
// в человекочитаемое название как в вашем интерфейсе проектов.
//
// Мы извлекаем ведущие цифры и мапим их на справочник (см. frontend/src/data/projects.js).
func getDiagramProjectTitle(diagramProjectID string) string {
	digits := ""
	for _, r := range diagramProjectID {
		if r < '0' || r > '9' {
			break
		}
		digits += string(r)
	}

	byID := map[string]string{
		"274": "Забайкальская ТЭС",
		"141": "Амурская (Свободненская) ТЭС",
		"144": "Артёмовская ТЭЦ",
		"254": "Балтийский ГХК",
		"271": "Динская ТЭС",
		"181": "Киришская ГРЭС",
		"136": "Нижнекамская ТЭЦ",
		"252": "Новочеркасская ГРЭС",
		"250": "Норильская ТЭЦ-3",
		"132": "Сахалинская ГРЭС-2",
		"246": "Сургутская ГРЭС-1",
		"21":  "ТЭЦ-25",
		"22":  "ТЭЦ-26",
		"261": "Южно-Якутская ТЭС",
		"68":  "Якутская ГРЭС-2",
		// "141b" в папках diagrams обычно не встречается как отдельный id,
		// но если встретится, можно будет добавить отдельную маппинг-строку.
	}

	if name, ok := byID[digits]; ok && name != "" {
		// Требование: "номер и название проекта в одном поле, как название".
		return fmt.Sprintf("%s | %s", digits, name)
	}

	// Fallback: если не смогли сопоставить — показываем "как есть".
	return diagramProjectID
}

func projectVisible(p AdminProject) bool {
	return p.Visible
}

func validateProjectTitle(title string) error {
	if strings.TrimSpace(title) == "" {
		return errors.New("title required")
	}
	if len([]rune(title)) > 120 {
		return errors.New("title too long")
	}
	return nil
}

func allowedDocExt(ext string) bool {
	switch strings.ToLower(ext) {
	case "pdf", "xls", "xlsx", "doc", "docx":
		return true
	default:
		return false
	}
}

func getCurrentADFullName(c *gin.Context) string {
	u := GetUserFromRequest(c)
	if u == nil {
		return "—"
	}
	if strings.TrimSpace(u.FullName) != "" {
		return u.FullName
	}
	if strings.TrimSpace(u.Username) != "" {
		return u.Username
	}
	return "—"
}

// GET /api/v1/projects
func ListProjects(c *gin.Context) {
	projectsMu.RLock()
	defer projectsMu.RUnlock()

	mp, _, err := buildAdminProjectMap()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	out := make([]AdminProject, 0, len(mp))
	for _, p := range mp {
		if !projectVisible(p) {
			continue
		}
		out = append(out, p)
	}
	c.JSON(http.StatusOK, out)
}

// GET /api/v1/admin/projects
func ListAdminProjects(c *gin.Context) {
	projectsMu.RLock()
	defer projectsMu.RUnlock()

	mp, _, err := buildAdminProjectMap()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	out := make([]AdminProject, 0, len(mp))
	for _, p := range mp {
		out = append(out, p)
	}
	// Сортируем: сначала видимые, потом по title
	sortProjects(out)
	c.JSON(http.StatusOK, out)
}

func sortProjects(list []AdminProject) {
	// мелкий helper без импорта sort (чтобы не тащить везде)
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			a, b := list[i], list[j]
			if a.Visible == b.Visible {
				if strings.ToLower(a.Title) > strings.ToLower(b.Title) {
					list[i], list[j] = list[j], list[i]
				}
			} else if a.Visible && !b.Visible {
				// ok
			} else {
				list[i], list[j] = list[j], list[i]
			}
		}
	}
}

// POST /api/v1/admin/projects
func CreateAdminProject(c *gin.Context) {
	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := validateProjectTitle(req.Title); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	author := getCurrentADFullName(c)
	id := slugify(req.Title)
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot build project id"})
		return
	}

	projectsMu.Lock()
	defer projectsMu.Unlock()

	list, err := loadAdminProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, p := range list {
		if p.ID == id {
			c.JSON(http.StatusConflict, gin.H{"error": "project already exists"})
			return
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	item := AdminProject{
		ID:        id,
		Title:     strings.TrimSpace(req.Title),
		Visible:   true,
		Author:    author,
		CreatedAt: now,
		Source:    "admin",
	}
	list = append(list, item)
	if err := saveAdminProjects(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

// PUT /api/v1/admin/projects/:id/visibility
func SetProjectVisibility(c *gin.Context) {
	projectID := c.Param("id")
	if strings.TrimSpace(projectID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	var req struct {
		Visible bool `json:"visible"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	projectsMu.Lock()
	defer projectsMu.Unlock()

	adminList, err := loadAdminProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	found := false
	for i := range adminList {
		if adminList[i].ID == projectID {
			adminList[i].Visible = req.Visible
			found = true
			break
		}
	}

	if !found {
		// Если проект из diagrams — создаём запись в meta, чтобы хранить visibility.
		adminList = append(adminList, AdminProject{
			ID:        projectID,
			Title:     projectID,
			Visible:   req.Visible,
			Author:    "",
			CreatedAt: "",
			Source:    "diagrams",
		})
	}

	if err := saveAdminProjects(adminList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /api/v1/admin/projects/:id
func HideProject(c *gin.Context) {
	projectID := c.Param("id")
	if strings.TrimSpace(projectID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	var req struct {
		Visible bool `json:"visible"`
	}
	_ = req // unused
	projectsMu.Lock()
	defer projectsMu.Unlock()

	adminList, err := loadAdminProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range adminList {
		if adminList[i].ID == projectID {
			adminList[i].Visible = false
			found = true
			break
		}
	}
	if !found {
		adminList = append(adminList, AdminProject{
			ID:      projectID,
			Title:   projectID,
			Visible: false,
			Source:  "diagrams",
		})
	}
	if err := saveAdminProjects(adminList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// POST /api/v1/admin/projects/:id/files (multipart)
func UploadProjectFile(c *gin.Context) {
	projectID := c.Param("id")
	if strings.TrimSpace(projectID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	origName := fileHeader.Filename
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(origName), "."))
	if !allowedDocExt(ext) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type"})
		return
	}

	docID := newID()
	author := getCurrentADFullName(c)
	now := time.Now().UTC().Format(time.RFC3339)

	safeOrig := filepath.Base(origName)
	safeOrig = strings.ReplaceAll(safeOrig, string(filepath.Separator), "_")
	safeOrig = strings.ReplaceAll(safeOrig, "/", "_")
	safeOrig = strings.ReplaceAll(safeOrig, "\\", "_")
	storedName := fmt.Sprintf("%s_%s", docID, safeOrig)

	root := getProjectFilesRoot()
	dstDir := filepath.Join(root, projectID)
	if err := ensureDir(dstDir); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dstPath := filepath.Join(dstDir, storedName)

	if err := saveUploadedFileStream(fileHeader, dstPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	meta := ProjectDocument{
		ID:      docID,
		Name:    safeOrig,
		Ext:     ext,
		Url:     fmt.Sprintf("/project-files/%s/%s", projectID, urlPathEscape(storedName)),
		AddedBy: author,
		AddedAt: now,
		Source:  "admin",
	}

	projectsMu.Lock()
	defer projectsMu.Unlock()

	docsByPrj, err := loadAdminDocs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	docsByPrj[projectID] = append(docsByPrj[projectID], adminDocMeta{
		ID:      docID,
		Name:    safeOrig,
		Ext:     ext,
		File:    storedName,
		AddedBy: author,
		AddedAt: now,
	})
	if err := saveAdminDocs(docsByPrj); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, meta)
}

// GET /api/v1/admin/projects/:id/files
func ListAdminProjectFiles(c *gin.Context) {
	projectID := c.Param("id")
	projectsMu.RLock()
	defer projectsMu.RUnlock()

	docsByPrj, err := loadAdminDocs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	list := docsByPrj[projectID]
	out := make([]ProjectDocument, 0, len(list))
	for _, d := range list {
		out = append(out, ProjectDocument{
			ID:      d.ID,
			Name:    d.Name,
			Ext:     d.Ext,
			Url:     fmt.Sprintf("/project-files/%s/%s", projectID, urlPathEscape(d.File)),
			AddedBy: d.AddedBy,
			AddedAt: d.AddedAt,
			Source:  "admin",
		})
	}
	c.JSON(http.StatusOK, out)
}

// DELETE /api/v1/admin/projects/:pid/files/:docId
func DeleteProjectFile(c *gin.Context) {
	projectID := c.Param("id")
	docID := c.Param("docId")
	if strings.TrimSpace(projectID) == "" || strings.TrimSpace(docID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid params"})
		return
	}

	projectsMu.Lock()
	defer projectsMu.Unlock()

	docsByPrj, err := loadAdminDocs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	list := docsByPrj[projectID]
	newList := make([]adminDocMeta, 0, len(list))
	var removed *adminDocMeta
	for i := range list {
		if list[i].ID == docID {
			removed = &list[i]
			continue
		}
		newList = append(newList, list[i])
	}
	if removed == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	docsByPrj[projectID] = newList
	if err := saveAdminDocs(docsByPrj); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	root := getProjectFilesRoot()
	_ = os.Remove(filepath.Join(root, projectID, removed.File))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/v1/projects/:projectId/documents
func ListProjectDocuments(c *gin.Context) {
	projectID := c.Param("projectId")
	projectsMu.RLock()
	defer projectsMu.RUnlock()

	mp, _, err := buildAdminProjectMap()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	p, ok := mp[projectID]
	if !ok || !p.Visible {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	// diagrams docs
	diagramsDocs := []ProjectDocument{}
	basePath := getDiagramsPathForProjects()
	projectDir := filepath.Join(basePath, projectID)
	if _, err := os.Stat(projectDir); err == nil {
		files, _ := os.ReadDir(projectDir)
		for idx, f := range files {
			if f.IsDir() {
				continue
			}
			name := f.Name()
			ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
			diagramsDocs = append(diagramsDocs, ProjectDocument{
				ID:      fmt.Sprintf("diag-%d", idx),
				Name:    name,
				Ext:     ext,
				Url:     fmt.Sprintf("/diagrams/%s/%s", projectID, urlPathEscape(name)),
				AddedBy: "PDMS",
				AddedAt: "",
				Source:  "diagrams",
			})
		}
	}

	// admin docs
	docsByPrj, err := loadAdminDocs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	adminDocs := []ProjectDocument{}
	for _, d := range docsByPrj[projectID] {
		adminDocs = append(adminDocs, ProjectDocument{
			ID:      d.ID,
			Name:    d.Name,
			Ext:     d.Ext,
			Url:     fmt.Sprintf("/project-files/%s/%s", projectID, urlPathEscape(d.File)),
			AddedBy: d.AddedBy,
			AddedAt: d.AddedAt,
			Source:  "admin",
		})
	}

	out := append(diagramsDocs, adminDocs...)
	c.JSON(http.StatusOK, out)
}

func urlPathEscape(s string) string {
	// Простая замена пробелов и unsafe-символов; для надежности достаточно url.PathEscape,
	// но здесь избегаем лишнего импорта.
	s = strings.ReplaceAll(s, " ", "%20")
	s = strings.ReplaceAll(s, "#", "%23")
	s = strings.ReplaceAll(s, "%", "%25")
	s = strings.ReplaceAll(s, "&", "%26")
	return s
}

func saveUploadedFileStream(fh *multipart.FileHeader, dstPath string) error {
	// gin.Context.SaveUploadedFile иногда корректно, но здесь сделаем потоково, чтобы лучше контролировать ошибки
	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}

