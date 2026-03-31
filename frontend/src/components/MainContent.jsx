import React from 'react';
import HomePage from './HomePage';
import AllSectionsPage from './AllSectionsPage';
import ProjectsPage from './ProjectsPage';
import ProjectPage from './ProjectPage';

function MainContent({
  showAllSections,
  setShowAllSections,
  currentPage,
  setCurrentPage,
  selectedProjectId,
  setSelectedProjectId,
  selectedDocument,
  setSelectedDocument,
  userData,
}) {
  if (currentPage === 'project' && selectedProjectId) {
    return (
      <main className="center-content center-content--wide">
        <ProjectPage
        projectId={selectedProjectId}
        onBack={() => {
          setSelectedProjectId(null);
          setCurrentPage('projects');
        }}
        onOpenDocument={(doc) => setSelectedDocument(doc)}
      />
      </main>
    );
  }

  if (currentPage === 'projects') {
    return (
      <main className="center-content">
        <ProjectsPage
        onBack={() => setCurrentPage('home')}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setCurrentPage('project');
        }}
      />
      </main>
    );
  }

  return (
    <main className="center-content">
      {showAllSections ? (
        <AllSectionsPage
          setShowAllSections={setShowAllSections}
          onNavigateToProjects={() => setCurrentPage('projects')}
        />
      ) : (
        <HomePage onNavigateToProjects={() => setCurrentPage('projects')} />
      )}
    </main>
  );
}

export default MainContent;