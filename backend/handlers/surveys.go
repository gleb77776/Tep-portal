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
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// Типы вопросов: single (один вариант), multiple (несколько), text (свободный ответ)
const (
	SurveyQSingle   = "single"
	SurveyQMultiple = "multiple"
	SurveyQText     = "text"
)

type SurveyQuestion struct {
	ID      string   `json:"id"`
	Type    string   `json:"type"`
	Text    string   `json:"text"`
	Options []string `json:"options,omitempty"`
}

type Survey struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Published   bool   `json:"published"`
	// Если true — один ответ на учётную запись портала (как в getUsernameFromRequest).
	OneSubmissionPerVisitor bool             `json:"oneSubmissionPerVisitor"`
	CreatedAt               string           `json:"createdAt"`
	Questions               []SurveyQuestion `json:"questions"`
}

type SurveyResponse struct {
	ID          string         `json:"id"`
	SurveyID    string         `json:"surveyId"`
	SubmittedAt string         `json:"submittedAt"`
	SubmittedBy string         `json:"submittedBy,omitempty"` // нормализованный логин портала
	Answers     map[string]any `json:"answers"`
}

var surveysMu sync.RWMutex

func surveyRespondentUsername(c *gin.Context) string {
	return normalizeSAMAccountName(getUsernameFromRequest(c))
}

func responseListHasUserSubmission(list []SurveyResponse, surveyID, normUser string) bool {
	if normUser == "" {
		return false
	}
	for i := range list {
		if list[i].SurveyID != surveyID {
			continue
		}
		if normalizeSAMAccountName(list[i].SubmittedBy) == normUser {
			return true
		}
	}
	return false
}

func getSurveysDataPath() string {
	if p := strings.TrimSpace(os.Getenv("SURVEYS_DATA_PATH")); p != "" {
		return p
	}
	cwd, _ := os.Getwd()
	for _, p := range []string{
		filepath.Join(cwd, "data", "surveys.json"),
		filepath.Join(cwd, "..", "data", "surveys.json"),
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return filepath.Join(cwd, "data", "surveys.json")
}

func getSurveyResponsesPath() string {
	if p := strings.TrimSpace(os.Getenv("SURVEY_RESPONSES_PATH")); p != "" {
		return p
	}
	dir := filepath.Dir(getSurveysDataPath())
	return filepath.Join(dir, "survey_responses.json")
}

func loadSurveys() ([]Survey, error) {
	p := getSurveysDataPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return []Survey{}, nil
		}
		return nil, err
	}
	var list []Survey
	if len(strings.TrimSpace(string(data))) == 0 {
		return []Survey{}, nil
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func saveSurveys(list []Survey) error {
	p := getSurveysDataPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func loadSurveyResponses() ([]SurveyResponse, error) {
	p := getSurveyResponsesPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return []SurveyResponse{}, nil
		}
		return nil, err
	}
	var list []SurveyResponse
	if len(strings.TrimSpace(string(data))) == 0 {
		return []SurveyResponse{}, nil
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func saveSurveyResponses(list []SurveyResponse) error {
	p := getSurveyResponsesPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func findSurveyByID(list []Survey, id string) (int, *Survey) {
	for i := range list {
		if list[i].ID == id {
			return i, &list[i]
		}
	}
	return -1, nil
}

func validateSurveyPayload(s *Survey, isCreate bool) string {
	s.Title = strings.TrimSpace(s.Title)
	if s.Title == "" {
		return "title required"
	}
	if len(s.Title) > 500 {
		return "title too long"
	}
	s.Description = strings.TrimSpace(s.Description)
	if len(s.Description) > 4000 {
		return "description too long"
	}
	if len(s.Questions) == 0 {
		return "at least one question required"
	}
	if len(s.Questions) > 80 {
		return "too many questions (max 80)"
	}
	seen := map[string]bool{}
	for i := range s.Questions {
		q := &s.Questions[i]
		q.Text = strings.TrimSpace(q.Text)
		if q.Text == "" {
			return "question text required"
		}
		if len(q.Text) > 2000 {
			return "question text too long"
		}
		t := strings.TrimSpace(strings.ToLower(q.Type))
		switch t {
		case SurveyQSingle, SurveyQMultiple, SurveyQText:
			q.Type = t
		default:
			return "invalid question type"
		}
		if q.Type == SurveyQText {
			q.Options = nil
			if q.ID == "" {
				q.ID = "q_" + uuid.New().String()[:8]
			}
			if seen[q.ID] {
				return "duplicate question id"
			}
			seen[q.ID] = true
			continue
		}
		opts := make([]string, 0, len(q.Options))
		for _, o := range q.Options {
			o = strings.TrimSpace(o)
			if o == "" {
				continue
			}
			if len(o) > 500 {
				return "option text too long"
			}
			opts = append(opts, o)
		}
		if len(opts) < 2 {
			return "choice questions need at least 2 options"
		}
		if len(opts) > 50 {
			return "too many options (max 50)"
		}
		q.Options = opts
		if q.ID == "" {
			q.ID = "q_" + uuid.New().String()[:8]
		}
		if seen[q.ID] {
			return "duplicate question id"
		}
		seen[q.ID] = true
	}
	if isCreate {
		s.ID = uuid.New().String()
		s.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	return ""
}

// GetPublicSurvey — опрос для прохождения (только опубликованные).
func GetPublicSurvey(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id required"})
		return
	}
	surveysMu.RLock()
	list, err := loadSurveys()
	var respList []SurveyResponse
	if err == nil {
		respList, err = loadSurveyResponses()
	}
	surveysMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_, s := findSurveyByID(list, id)
	if s == nil || !s.Published {
		c.JSON(http.StatusNotFound, gin.H{"error": "survey not found"})
		return
	}
	user := surveyRespondentUsername(c)
	alreadySubmitted := s.OneSubmissionPerVisitor && responseListHasUserSubmission(respList, id, user)
	raw, err := json.Marshal(s)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	payload["alreadySubmitted"] = alreadySubmitted
	if s.OneSubmissionPerVisitor {
		payload["needsPortalUser"] = user == ""
	}
	c.JSON(http.StatusOK, payload)
}

// SubmitSurveyResponse — публичная отправка ответов; пользователь определяется как в /user/me (query username, заголовки SSO).
func SubmitSurveyResponse(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id required"})
		return
	}
	var body struct {
		Answers map[string]any `json:"answers"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}
	if body.Answers == nil {
		body.Answers = map[string]any{}
	}

	surveysMu.Lock()
	defer surveysMu.Unlock()
	list, err := loadSurveys()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_, survey := findSurveyByID(list, id)
	if survey == nil || !survey.Published {
		c.JSON(http.StatusNotFound, gin.H{"error": "survey not found"})
		return
	}
	respondent := surveyRespondentUsername(c)
	respList, err := loadSurveyResponses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if survey.OneSubmissionPerVisitor {
		if respondent == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Войдите в портал (учётная запись), чтобы отправить ответ"})
			return
		}
		if responseListHasUserSubmission(respList, id, respondent) {
			c.JSON(http.StatusConflict, gin.H{"error": "Вы уже отправили ответ на этот опрос"})
			return
		}
	}
	for _, q := range survey.Questions {
		raw, ok := body.Answers[q.ID]
		if !ok || raw == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing answer for: " + q.Text})
			return
		}
		switch q.Type {
		case SurveyQText:
			s, ok := raw.(string)
			if !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid text answer"})
				return
			}
			if strings.TrimSpace(s) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "empty text answer"})
				return
			}
			if len(s) > 8000 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "answer too long"})
				return
			}
		case SurveyQSingle:
			s, ok := raw.(string)
			if !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid single answer"})
				return
			}
			s = strings.TrimSpace(s)
			if !optionContains(q.Options, s) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid option"})
				return
			}
		case SurveyQMultiple:
			arr, ok := raw.([]any)
			if !ok || len(arr) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "select at least one option"})
				return
			}
			picked := map[string]bool{}
			for _, v := range arr {
				s, ok := v.(string)
				if !ok {
					c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multiple answer"})
					return
				}
				s = strings.TrimSpace(s)
				if !optionContains(q.Options, s) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "invalid option"})
					return
				}
				picked[s] = true
			}
			if len(picked) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "select at least one option"})
				return
			}
		}
	}

	rec := SurveyResponse{
		ID:          uuid.New().String(),
		SurveyID:    id,
		SubmittedAt: time.Now().UTC().Format(time.RFC3339),
		SubmittedBy: respondent,
		Answers:     body.Answers,
	}
	respList = append(respList, rec)
	if err := saveSurveyResponses(respList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": rec.ID})
}

func optionContains(opts []string, v string) bool {
	for _, o := range opts {
		if o == v {
			return true
		}
	}
	return false
}

func formatSurveyAnswerForExcel(q SurveyQuestion, raw any) string {
	if raw == nil {
		return ""
	}
	switch q.Type {
	case SurveyQText:
		if s, ok := raw.(string); ok {
			return s
		}
	case SurveyQSingle:
		if s, ok := raw.(string); ok {
			return s
		}
	case SurveyQMultiple:
		switch v := raw.(type) {
		case []any:
			parts := make([]string, 0, len(v))
			for _, x := range v {
				if s, ok := x.(string); ok {
					parts = append(parts, s)
				} else {
					parts = append(parts, fmt.Sprint(x))
				}
			}
			return strings.Join(parts, "; ")
		case []string:
			return strings.Join(v, "; ")
		}
	}
	return fmt.Sprint(raw)
}

// ExportSurveyResponsesExcel — выгрузка ответов по опросу в .xlsx.
func ExportSurveyResponsesExcel(c *gin.Context) {
	surveyID := strings.TrimSpace(c.Param("id"))
	if surveyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id required"})
		return
	}

	surveysMu.RLock()
	surveyList, err := loadSurveys()
	if err != nil {
		surveysMu.RUnlock()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_, survey := findSurveyByID(surveyList, surveyID)
	if survey == nil {
		surveysMu.RUnlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "survey not found"})
		return
	}
	allResp, err := loadSurveyResponses()
	surveysMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var rows []SurveyResponse
	for _, r := range allResp {
		if r.SurveyID == surveyID {
			rows = append(rows, r)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].SubmittedAt < rows[j].SubmittedAt
	})

	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	const sheet = "Ответы"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = f.SetCellValue(sheet, "A1", "Кто проходил")
	_ = f.SetCellValue(sheet, "B1", "Дата ответа")
	for qi := range survey.Questions {
		n := qi + 1
		colText, err := excelize.ColumnNumberToName(3 + qi*2)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		colAns, err := excelize.ColumnNumberToName(4 + qi*2)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_ = f.SetCellValue(sheet, colText+"1", fmt.Sprintf("Текст вопроса №%d", n))
		_ = f.SetCellValue(sheet, colAns+"1", fmt.Sprintf("Ответ №%d", n))
	}

	for ri, r := range rows {
		rowNum := ri + 2
		who := strings.TrimSpace(r.SubmittedBy)
		if who == "" {
			who = "—"
		}
		cellA, err := excelize.CoordinatesToCellName(1, rowNum)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		cellB, err := excelize.CoordinatesToCellName(2, rowNum)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_ = f.SetCellValue(sheet, cellA, who)
		_ = f.SetCellValue(sheet, cellB, r.SubmittedAt)
		for qi, q := range survey.Questions {
			cellText, err := excelize.CoordinatesToCellName(3+qi*2, rowNum)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			cellAns, err := excelize.CoordinatesToCellName(4+qi*2, rowNum)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			_ = f.SetCellValue(sheet, cellText, q.Text)
			raw := r.Answers[q.ID]
			val := formatSurveyAnswerForExcel(q, raw)
			_ = f.SetCellValue(sheet, cellAns, val)
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := "survey_responses_" + surveyID + ".xlsx"
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
}

// ListSurveysAdmin — все опросы.
func ListSurveysAdmin(c *gin.Context) {
	surveysMu.RLock()
	list, err := loadSurveys()
	surveysMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func CreateSurvey(c *gin.Context) {
	var s Survey
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}
	if msg := validateSurveyPayload(&s, true); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	surveysMu.Lock()
	defer surveysMu.Unlock()
	list, err := loadSurveys()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	list = append(list, s)
	if err := saveSurveys(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, s)
}

func UpdateSurvey(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id required"})
		return
	}
	var s Survey
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}
	s.ID = id
	if msg := validateSurveyPayload(&s, false); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	surveysMu.Lock()
	defer surveysMu.Unlock()
	list, err := loadSurveys()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	idx, old := findSurveyByID(list, id)
	if old == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	s.CreatedAt = old.CreatedAt
	list[idx] = s
	if err := saveSurveys(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func DeleteSurvey(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	surveysMu.Lock()
	defer surveysMu.Unlock()
	list, err := loadSurveys()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]Survey, 0, len(list))
	found := false
	for _, s := range list {
		if s.ID == id {
			found = true
			continue
		}
		out = append(out, s)
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := saveSurveys(out); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListAllSurveyResponsesAdmin — все ответы (для сводки в админке).
func ListAllSurveyResponsesAdmin(c *gin.Context) {
	surveysMu.RLock()
	list, err := loadSurveyResponses()
	surveysMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// ListSurveyResponses — ответы по опросу.
func ListSurveyResponses(c *gin.Context) {
	surveyID := strings.TrimSpace(c.Param("id"))
	surveysMu.RLock()
	all, err := loadSurveyResponses()
	surveysMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var filtered []SurveyResponse
	for _, r := range all {
		if surveyID == "" || r.SurveyID == surveyID {
			filtered = append(filtered, r)
		}
	}
	c.JSON(http.StatusOK, filtered)
}
