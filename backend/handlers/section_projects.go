package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Отдельное хранилище проектов для раздела с шаблоном «projects» (/s/:slug), не общий /projects.
var sectionProjectsMu sync.RWMutex

func getSectionProjectsDir(sectionID string) string {
	return filepath.Join(resolveDataDir(), "site_section_projects", sectionID)
}

func getSectionProjectsStoragePath(sectionID string) string {
	return filepath.Join(getSectionProjectsDir(sectionID), "storage.json")
}

func getSectionProjectsFilesRoot(sectionID string) string {
	return filepath.Join(getSectionProjectsDir(sectionID), "files")
}

type sectionProjectsStorage struct {
	Projects      []AdminProject            `json:"projects"`
	DocsByProject map[string][]adminDocMeta `json:"docsByProject"`
}

func loadSectionProjectsStorage(sectionID string) (*sectionProjectsStorage, error) {
	p := getSectionProjectsStoragePath(sectionID)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &sectionProjectsStorage{
				Projects:      []AdminProject{},
				DocsByProject: map[string][]adminDocMeta{},
			}, nil
		}
		return nil, err
	}
	var st sectionProjectsStorage
	if err := json.Unmarshal(data, &st); err != nil {
		return nil, err
	}
	if st.Projects == nil {
		st.Projects = []AdminProject{}
	}
	if st.DocsByProject == nil {
		st.DocsByProject = map[string][]adminDocMeta{}
	}
	return &st, nil
}

func saveSectionProjectsStorage(sectionID string, st *sectionProjectsStorage) error {
	p := getSectionProjectsStoragePath(sectionID)
	if err := ensureDir(filepath.Dir(p)); err != nil {
		return err
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func findSiteSectionProjectsBySlug(slug string) (*SiteSection, error) {
	siteSectionsMu.RLock()
	defer siteSectionsMu.RUnlock()
	list, err := loadSiteSections()
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].Slug == slug && list[i].Template == TplProjects {
			return &list[i], nil
		}
	}
	return nil, os.ErrNotExist
}


func allowedSectionProjectDocExt(ext string) bool {
	switch strings.ToLower(ext) {
	case "pdf", "xls", "xlsx", "doc", "docx", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "dwg", "dxf":
		return true
	default:
		return false
	}
}


func InitEmptySectionProjectsStorage(sectionID string) error {
	sectionProjectsMu.Lock()
	defer sectionProjectsMu.Unlock()
	st := &sectionProjectsStorage{
		Projects:      []AdminProject{},
		DocsByProject: map[string][]adminDocMeta{},
	}
	if err := ensureDir(getSectionProjectsFilesRoot(sectionID)); err != nil {
		return err
	}
	return saveSectionProjectsStorage(sectionID, st)
}

func RemoveSectionProjectsStorage(sectionID string) error {
	return os.RemoveAll(getSectionProjectsDir(sectionID))
}


func ListScopedProjects(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	sectionProjectsMu.RLock()
	defer sectionProjectsMu.RUnlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]AdminProject, 0, len(st.Projects))
	for _, p := range st.Projects {
		if projectVisible(p) {
			out = append(out, p)
		}
	}
	c.JSON(http.StatusOK, out)
}

// GET /api/v1/site-sections/scoped/:slug/projects/:projectId — один проект раздела.
func GetScopedProject(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	projectID := strings.TrimSpace(c.Param("projectId"))
	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	sectionProjectsMu.RLock()
	defer sectionProjectsMu.RUnlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range st.Projects {
		if st.Projects[i].ID == projectID {
			if !projectVisible(st.Projects[i]) {
				c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
				return
			}
			c.JSON(http.StatusOK, st.Projects[i])
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
}

// GET /api/v1/site-sections/scoped/:slug/projects/:projectId/documents?scope=all|admin|diagrams
func ListScopedProjectDocuments(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	projectID := strings.TrimSpace(c.Param("projectId"))
	scope := strings.TrimSpace(strings.ToLower(c.Query("scope")))
	if scope == "" {
		scope = "all"
	}
	switch scope {
	case "all", "admin", "diagrams":
	default:
		scope = "all"
	}

	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	sectionProjectsMu.RLock()
	defer sectionProjectsMu.RUnlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var proj *AdminProject
	for i := range st.Projects {
		if st.Projects[i].ID == projectID {
			proj = &st.Projects[i]
			break
		}
	}
	if proj == nil || !projectVisible(*proj) {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	// В архивном разделе нет каталога PDMS — список «диаграмм» всегда пустой (флаг только скрывает пункт в UI).
	if scope == "diagrams" {
		c.JSON(http.StatusOK, []ProjectDocument{})
		return
	}
	list := st.DocsByProject[projectID]
	out := make([]ProjectDocument, 0, len(list))
	for _, d := range list {
		out = append(out, ProjectDocument{
			ID:      d.ID,
			Name:    d.Name,
			Ext:     d.Ext,
			Url:     fmt.Sprintf("/section-project-files/%s/%s/%s", sec.ID, projectID, urlPathEscape(d.File)),
			AddedBy: d.AddedBy,
			AddedAt: d.AddedAt,
			Source:  "admin",
		})
	}
	c.JSON(http.StatusOK, out)
}

// GET /api/v1/admin/site-sections/scoped/:slug/projects
func ListAdminScopedProjects(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	sectionProjectsMu.RLock()
	defer sectionProjectsMu.RUnlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, st.Projects)
}

// POST /api/v1/admin/site-sections/scoped/:slug/projects/reorder — тело { "ids": [...] }.
func ReorderScopedProjects(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	rank := make(map[string]int, len(req.IDs))
	for i, id := range req.IDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := rank[id]; !ok {
			rank[id] = i
		}
	}
	sectionProjectsMu.Lock()
	defer sectionProjectsMu.Unlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sort.SliceStable(st.Projects, func(i, j int) bool {
		ri, okI := rank[st.Projects[i].ID]
		rj, okJ := rank[st.Projects[j].ID]
		switch {
		case okI && okJ:
			return ri < rj
		case okI && !okJ:
			return true
		case !okI && okJ:
			return false
		default:
			return strings.ToLower(st.Projects[i].Title) < strings.ToLower(st.Projects[j].Title)
		}
	})
	if err := saveSectionProjectsStorage(sec.ID, st); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// POST /api/v1/admin/site-sections/scoped/:slug/projects
func CreateAdminScopedProject(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	var req struct {
		Title           string `json:"title"`
		FolderLink      string `json:"folderLink"`
		DiagramsEnabled *bool  `json:"diagramsEnabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := validateProjectTitle(req.Title); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateFolderLink(strings.TrimSpace(req.FolderLink)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := slugify(req.Title)
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot build project id"})
		return
	}
	author := getCurrentADFullName(c)
	now := time.Now().UTC().Format(time.RFC3339)
	diagOff := false
	item := AdminProject{
		ID:              id,
		Title:           strings.TrimSpace(req.Title),
		Visible:         true,
		Author:          author,
		CreatedAt:       now,
		Source:          "admin",
		FolderLink:      strings.TrimSpace(req.FolderLink),
		DiagramsEnabled: &diagOff,
	}
	if req.DiagramsEnabled != nil {
		item.DiagramsEnabled = req.DiagramsEnabled
	}
	sectionProjectsMu.Lock()
	defer sectionProjectsMu.Unlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, p := range st.Projects {
		if p.ID == id {
			c.JSON(http.StatusConflict, gin.H{"error": "project already exists"})
			return
		}
	}
	st.Projects = append(st.Projects, item)
	if err := saveSectionProjectsStorage(sec.ID, st); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

// PUT /api/v1/admin/site-sections/scoped/:slug/projects/:id/settings
func UpdateScopedProjectSettings(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	projectID := strings.TrimSpace(c.Param("id"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	var req struct {
		FolderLink      string `json:"folderLink"`
		DiagramsEnabled *bool  `json:"diagramsEnabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := validateFolderLink(strings.TrimSpace(req.FolderLink)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sectionProjectsMu.Lock()
	defer sectionProjectsMu.Unlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range st.Projects {
		if st.Projects[i].ID == projectID {
			st.Projects[i].FolderLink = strings.TrimSpace(req.FolderLink)
			if req.DiagramsEnabled != nil {
				st.Projects[i].DiagramsEnabled = req.DiagramsEnabled
			}
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if err := saveSectionProjectsStorage(sec.ID, st); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/v1/admin/site-sections/scoped/:slug/projects/:id/files
func ListAdminScopedProjectFiles(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	projectID := strings.TrimSpace(c.Param("id"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	sectionProjectsMu.RLock()
	defer sectionProjectsMu.RUnlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	list := st.DocsByProject[projectID]
	out := make([]ProjectDocument, 0, len(list))
	for _, d := range list {
		out = append(out, ProjectDocument{
			ID:      d.ID,
			Name:    d.Name,
			Ext:     d.Ext,
			Url:     fmt.Sprintf("/section-project-files/%s/%s/%s", sec.ID, projectID, urlPathEscape(d.File)),
			AddedBy: d.AddedBy,
			AddedAt: d.AddedAt,
			Source:  "admin",
		})
	}
	c.JSON(http.StatusOK, out)
}

// POST /api/v1/admin/site-sections/scoped/:slug/projects/:id/files
func UploadScopedProjectFile(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	projectID := strings.TrimSpace(c.Param("id"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	origName := fileHeader.Filename
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(origName), "."))
	if !allowedSectionProjectDocExt(ext) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type"})
		return
	}
	docID := newID()
	author := getCurrentADFullName(c)
	now := time.Now().UTC().Format(time.RFC3339)
	safeOrig := filepath.Base(origName)
	safeOrig = strings.ReplaceAll(safeOrig, string(filepath.Separator), "_")
	storedName := fmt.Sprintf("%s_%s", docID, safeOrig)

	root := getSectionProjectsFilesRoot(sec.ID)
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
		Url:     fmt.Sprintf("/section-project-files/%s/%s/%s", sec.ID, projectID, urlPathEscape(storedName)),
		AddedBy: author,
		AddedAt: now,
		Source:  "admin",
	}
	sectionProjectsMu.Lock()
	defer sectionProjectsMu.Unlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for _, p := range st.Projects {
		if p.ID == projectID {
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	st.DocsByProject[projectID] = append(st.DocsByProject[projectID], adminDocMeta{
		ID:      docID,
		Name:    safeOrig,
		Ext:     ext,
		File:    storedName,
		AddedBy: author,
		AddedAt: now,
	})
	if err := saveSectionProjectsStorage(sec.ID, st); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, meta)
}

// DELETE /api/v1/admin/site-sections/scoped/:slug/projects/:id/files/:docId
func DeleteScopedProjectFile(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	projectID := strings.TrimSpace(c.Param("id"))
	docID := strings.TrimSpace(c.Param("docId"))
	sec, err := findSiteSectionProjectsBySlug(slug)
	if err != nil || sec == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	sectionProjectsMu.Lock()
	defer sectionProjectsMu.Unlock()
	st, err := loadSectionProjectsStorage(sec.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	list := st.DocsByProject[projectID]
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
	st.DocsByProject[projectID] = newList
	if err := saveSectionProjectsStorage(sec.ID, st); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	root := getSectionProjectsFilesRoot(sec.ID)
	_ = os.Remove(filepath.Join(root, projectID, removed.File))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ServeSectionProjectFile — GET /section-project-files/:sectionId/:projectId/*filepath
func ServeSectionProjectFile(c *gin.Context) {
	sectionID := strings.TrimSpace(c.Param("sectionId"))
	projectID := strings.TrimSpace(c.Param("projectId"))
	fp := strings.TrimPrefix(c.Param("filepath"), "/")
	fp = strings.TrimPrefix(fp, "\\")
	if sectionID == "" || projectID == "" || fp == "" {
		c.Status(http.StatusBadRequest)
		return
	}
	base := filepath.Join(getSectionProjectsFilesRoot(sectionID), projectID)
	fullPath, ok := safeJoin(base, fp)
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
