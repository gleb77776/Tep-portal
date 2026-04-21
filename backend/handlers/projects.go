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
	"sort"
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
	// FolderLink — ссылка на папку в сети (file://, https://, UNC и т.д.), показывается в списке проектов.
	FolderLink string `json:"folderLink,omitempty"`
	// DiagramsEnabled: nil = по умолчанию показывать блок «Диаграммы» (глобальные проекты); false — скрыть.
	DiagramsEnabled *bool `json:"diagramsEnabled,omitempty"`
	// DiagramsFolderID — имя подпапки в data/diagrams с PDF из PDMS, если оно не совпадает с id (например id «141», папка «141N50_Svobodnenskaya»).
	DiagramsFolderID string `json:"diagramsFolderId,omitempty"`
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

// loadProjectsMeta читает projects_admin.json: слайс проектов и полный порядок id для списка (в т.ч. только из diagrams).
func loadProjectsMeta() ([]AdminProject, []string, error) {
	path := getProjectsMetaPath()
	var wrap struct {
		Projects []AdminProject `json:"projects"`
		Order    []string       `json:"order,omitempty"`
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return []AdminProject{}, nil, nil
	}
	if err := readJSONFile(path, &wrap); err != nil {
		return nil, nil, err
	}
	if wrap.Projects == nil {
		wrap.Projects = []AdminProject{}
	}
	return wrap.Projects, wrap.Order, nil
}

func loadAdminProjects() ([]AdminProject, error) {
	p, _, err := loadProjectsMeta()
	return p, err
}

func writeProjectsMeta(list []AdminProject, order []string) error {
	payload := map[string]any{"projects": list}
	if len(order) > 0 {
		payload["order"] = order
	}
	err := writeJSONFile(getProjectsMetaPath(), payload)
	if err == nil {
		invalidateProjectMapCache()
	}
	return err
}

// saveAdminProjects сохраняет проекты и по возможности сохраняет порядок order (в т.ч. слоты только из diagrams).
func saveAdminProjects(list []AdminProject) error {
	_, oldOrder, err := loadProjectsMeta()
	if err != nil {
		return err
	}
	inList := make(map[string]struct{}, len(list))
	for _, p := range list {
		inList[p.ID] = struct{}{}
	}
	seen := make(map[string]struct{})
	var newOrder []string
	for _, id := range oldOrder {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		if _, ok := inList[id]; ok {
			newOrder = append(newOrder, id)
			seen[id] = struct{}{}
			continue
		}
		// id только в order (например проект из diagrams без строки в projects) — оставляем позицию
		newOrder = append(newOrder, id)
		seen[id] = struct{}{}
	}
	for _, p := range list {
		if _, ok := seen[p.ID]; !ok {
			newOrder = append(newOrder, p.ID)
		}
	}
	return writeProjectsMeta(list, newOrder)
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

// Кэш списка проектов: повторные запросы (список + документы + meta) не читают диск подряд.
var projectMapSnapshot struct {
	mu      sync.Mutex
	until   time.Time
	mp      map[string]AdminProject
	diagram map[string]bool
	err     error
}

const projectMapCacheTTL = 4 * time.Second

func invalidateProjectMapCache() {
	projectMapSnapshot.mu.Lock()
	projectMapSnapshot.until = time.Time{}
	projectMapSnapshot.mu.Unlock()
}

func getProjectMapCached() (map[string]AdminProject, map[string]bool, error) {
	now := time.Now()
	projectMapSnapshot.mu.Lock()
	defer projectMapSnapshot.mu.Unlock()
	if projectMapSnapshot.mp != nil && now.Before(projectMapSnapshot.until) {
		return projectMapSnapshot.mp, projectMapSnapshot.diagram, projectMapSnapshot.err
	}
	mp, d, err := buildAdminProjectMap()
	projectMapSnapshot.mp = mp
	projectMapSnapshot.diagram = d
	projectMapSnapshot.err = err
	projectMapSnapshot.until = time.Now().Add(projectMapCacheTTL)
	return mp, d, err
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

func projectDiagramsEnabled(p AdminProject) bool {
	if p.DiagramsEnabled != nil {
		return *p.DiagramsEnabled
	}
	return true
}

func validateFolderLink(s string) error {
	if len([]rune(s)) > 2048 {
		return errors.New("folder link too long")
	}
	return nil
}

// loadDiagramTitleMap читает data/diagrams/<project>/diagram_titles.json и опционально
// diagram_titles.local.json (ручные дополнения; ключи из local перекрывают основной файл).
func loadDiagramTitleMap(projectDir string) map[string]string {
	merge := func(name string, into map[string]string) {
		p := filepath.Join(projectDir, name)
		data, err := os.ReadFile(p)
		if err != nil {
			return
		}
		var patch map[string]string
		if err := json.Unmarshal(data, &patch); err != nil {
			return
		}
		for k, v := range patch {
			if strings.TrimSpace(v) != "" {
				into[k] = strings.TrimSpace(v)
			}
		}
	}
	out := make(map[string]string)
	merge("diagram_titles.json", out)
	merge("diagram_titles.local.json", out)
	if len(out) == 0 {
		return nil
	}
	return out
}

// loadDiagramPdmsAtMap — даты добавления на портал из скрипта выгрузки PDMS (diagram_pdms_at.json).
func loadDiagramPdmsAtMap(projectDir string) map[string]string {
	p := filepath.Join(projectDir, "diagram_pdms_at.json")
	data, err := os.ReadFile(p)
	if err != nil {
		return nil
	}
	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return nil
	}
	out := make(map[string]string)
	for k, v := range m {
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if k != "" && v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func validateDiagramsFolderID(s string) error {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if len([]rune(s)) > 120 {
		return errors.New("diagramsFolderId too long")
	}
	for _, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-'
		if !ok {
			return errors.New("diagramsFolderId: только буквы, цифры, _ и -")
		}
	}
	return nil
}

// diagramsStorageSubdir — каталог в data/diagrams для файлов PDMS (URL /diagrams/<subdir>/...).
func diagramsStorageSubdir(p AdminProject, logicalID string) string {
	if s := strings.TrimSpace(p.DiagramsFolderID); s != "" {
		return s
	}
	return logicalID
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

	mp, _, err := getProjectMapCached()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	adminList, order, err := loadProjectsMeta()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	merged := mergeProjectListOrdered(adminList, order, mp)
	out := make([]AdminProject, 0, len(merged))
	for _, p := range merged {
		if projectVisible(p) {
			out = append(out, p)
		}
	}
	c.JSON(http.StatusOK, out)
}

// GET /api/v1/projects/:projectId — один проект (для карточки без загрузки всего списка).
func GetPublicProject(c *gin.Context) {
	projectID := strings.TrimSpace(c.Param("projectId"))
	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	projectsMu.RLock()
	defer projectsMu.RUnlock()
	mp, _, err := getProjectMapCached()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	p, ok := mp[projectID]
	if !ok || !projectVisible(p) {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

// GET /api/v1/admin/projects
func ListAdminProjects(c *gin.Context) {
	projectsMu.RLock()
	defer projectsMu.RUnlock()

	mp, _, err := getProjectMapCached()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	adminList, order, err := loadProjectsMeta()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := mergeProjectListOrdered(adminList, order, mp)
	c.JSON(http.StatusOK, out)
}

// mergeProjectListOrdered: если в файле задано поле order — полный порядок id (админка + только diagrams);
// иначе порядок строк projects, затем остальные из diagrams (старое поведение).
func mergeProjectListOrdered(adminList []AdminProject, order []string, mp map[string]AdminProject) []AdminProject {
	if len(order) > 0 {
		seen := make(map[string]struct{}, len(mp))
		out := make([]AdminProject, 0, len(mp))
		for _, id := range order {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if p, ok := mp[id]; ok {
				out = append(out, p)
				seen[id] = struct{}{}
			}
		}
		rest := make([]AdminProject, 0, len(mp))
		for id, p := range mp {
			if _, ok := seen[id]; ok {
				continue
			}
			rest = append(rest, p)
		}
		sortProjects(rest)
		out = append(out, rest...)
		return out
	}
	seen := make(map[string]struct{}, len(mp))
	out := make([]AdminProject, 0, len(mp))
	for _, p := range adminList {
		if merged, ok := mp[p.ID]; ok {
			out = append(out, merged)
			seen[p.ID] = struct{}{}
		}
	}
	rest := make([]AdminProject, 0, len(mp))
	for id, p := range mp {
		if _, ok := seen[id]; ok {
			continue
		}
		rest = append(rest, p)
	}
	sortProjects(rest)
	out = append(out, rest...)
	return out
}

// POST /api/v1/admin/projects/reorder — тело { "ids": ["id1","id2",...] } в нужном порядке (как в списке админки).
func ReorderAdminProjects(c *gin.Context) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
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
	projectsMu.Lock()
	defer projectsMu.Unlock()
	adminList, err := loadAdminProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sort.SliceStable(adminList, func(i, j int) bool {
		ri, okI := rank[adminList[i].ID]
		rj, okJ := rank[adminList[j].ID]
		switch {
		case okI && okJ:
			return ri < rj
		case okI && !okJ:
			return true
		case !okI && okJ:
			return false
		default:
			return strings.ToLower(adminList[i].Title) < strings.ToLower(adminList[j].Title)
		}
	})
	fullOrder := normalizeProjectIDOrder(req.IDs)
	if err := writeProjectsMeta(adminList, fullOrder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func normalizeProjectIDOrder(ids []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
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
		Title             string `json:"title"`
		FolderLink        string `json:"folderLink"`
		DiagramsEnabled   *bool  `json:"diagramsEnabled"`
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
		ID:                id,
		Title:             strings.TrimSpace(req.Title),
		Visible:           true,
		Author:            author,
		CreatedAt:         now,
		Source:            "admin",
		FolderLink:        strings.TrimSpace(req.FolderLink),
		DiagramsEnabled:   req.DiagramsEnabled,
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

// PUT /api/v1/admin/projects/:id/settings
func UpdateProjectSettings(c *gin.Context) {
	projectID := strings.TrimSpace(c.Param("id"))
	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}
	var req struct {
		FolderLink       string  `json:"folderLink"`
		DiagramsEnabled  *bool   `json:"diagramsEnabled"`
		DiagramsFolderID *string `json:"diagramsFolderId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := validateFolderLink(strings.TrimSpace(req.FolderLink)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.DiagramsFolderID != nil {
		if err := validateDiagramsFolderID(*req.DiagramsFolderID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	projectsMu.Lock()
	defer projectsMu.Unlock()

	mp, _, err := getProjectMapCached()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	base, ok := mp[projectID]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	adminList, err := loadAdminProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range adminList {
		if adminList[i].ID == projectID {
			adminList[i].FolderLink = strings.TrimSpace(req.FolderLink)
			if req.DiagramsFolderID != nil {
				adminList[i].DiagramsFolderID = strings.TrimSpace(*req.DiagramsFolderID)
			}
			if req.DiagramsEnabled != nil {
				adminList[i].DiagramsEnabled = req.DiagramsEnabled
			}
			found = true
			break
		}
	}
	if !found {
		np := base
		np.FolderLink = strings.TrimSpace(req.FolderLink)
		if req.DiagramsFolderID != nil {
			np.DiagramsFolderID = strings.TrimSpace(*req.DiagramsFolderID)
		}
		if req.DiagramsEnabled != nil {
			np.DiagramsEnabled = req.DiagramsEnabled
		}
		adminList = append(adminList, np)
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

// GET /api/v1/projects/:projectId/documents?scope=all|admin|diagrams
func ListProjectDocuments(c *gin.Context) {
	projectID := c.Param("projectId")
	scope := strings.TrimSpace(strings.ToLower(c.Query("scope")))
	if scope == "" {
		scope = "all"
	}
	switch scope {
	case "all", "admin", "diagrams":
	default:
		scope = "all"
	}

	projectsMu.RLock()
	defer projectsMu.RUnlock()

	mp, _, err := getProjectMapCached()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	p, ok := mp[projectID]
	if !ok || !p.Visible {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	showDiagrams := projectDiagramsEnabled(p)
	diagSub := diagramsStorageSubdir(p, projectID)

	// diagrams docs
	diagramsDocs := []ProjectDocument{}
	if (scope == "all" || scope == "diagrams") && showDiagrams {
		basePath := getDiagramsPathForProjects()
		projectDir := filepath.Join(basePath, diagSub)
		if _, err := os.Stat(projectDir); err == nil {
			titleByFile := loadDiagramTitleMap(projectDir)
			pdmsAtByFile := loadDiagramPdmsAtMap(projectDir)
			files, _ := os.ReadDir(projectDir)
			for idx, f := range files {
				if f.IsDir() {
					continue
				}
				name := f.Name()
				if name == "diagram_titles.json" || name == "diagram_pdms_at.json" {
					continue
				}
				displayName := name
				if titleByFile != nil {
					if t, ok := titleByFile[name]; ok && strings.TrimSpace(t) != "" {
						displayName = strings.TrimSpace(t)
					}
				}
				ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
				addedAt := ""
				if pdmsAtByFile != nil {
					if t, ok := pdmsAtByFile[name]; ok && strings.TrimSpace(t) != "" {
						addedAt = strings.TrimSpace(t)
					}
				}
				if addedAt == "" {
					if fi, err := f.Info(); err == nil {
						addedAt = fi.ModTime().UTC().Format(time.RFC3339)
					}
				}
				diagramsDocs = append(diagramsDocs, ProjectDocument{
					ID:      fmt.Sprintf("diag-%d", idx),
					Name:    displayName,
					Ext:     ext,
					Url:     fmt.Sprintf("/diagrams/%s/%s", diagSub, urlPathEscape(name)),
					AddedBy: "PDMS",
					AddedAt: addedAt,
					Source:  "diagrams",
				})
			}
		}
	}

	// admin docs
	docsByPrj, err := loadAdminDocs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	adminDocs := []ProjectDocument{}
	if scope == "all" || scope == "admin" {
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
	}

	var out []ProjectDocument
	switch scope {
	case "diagrams":
		out = diagramsDocs
	case "admin":
		out = adminDocs
	default:
		out = append(diagramsDocs, adminDocs...)
	}
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

