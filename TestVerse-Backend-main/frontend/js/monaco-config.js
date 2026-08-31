/**
 * Monaco Editor Configuration for Exam Portal
 */

// Configure Monaco Editor
if (typeof require !== 'undefined') {
  require.config({ 
    paths: { 
      'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' 
    } 
  });
}

function initializeMonacoEditor(editorElement, language, initialValue = '') {
  return new Promise((resolve, reject) => {
    if (typeof require === 'undefined') {
      reject(new Error('Monaco loader not found'));
      return;
    }

    const languageMap = {
      'python': 'python',
      'java': 'java',
      'javascript': 'javascript',
      'js': 'javascript',
      'cpp': 'cpp',
      'c++': 'cpp',
      'c': 'c',
      'typescript': 'typescript',
      'ts': 'typescript',
      'html': 'html',
      'css': 'css',
      'sql': 'sql'
    };
    
    const editorLanguage = languageMap[language.toLowerCase()] || language;

    try {
      require(['vs/editor/editor.main'], (monaco) => {
        if (!editorElement) {
          reject(new Error('Editor element not found'));
          return;
        }

        const editor = monaco.editor.create(editorElement, {
          value: initialValue,
          language: editorLanguage,
          theme: 'vs-dark',
          automaticLayout: true,
          fontSize: 14,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          autoIndent: 'full',
          formatOnType: true,
          formatOnPaste: true,
          tabSize: 4,
          insertSpaces: true,
          fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace"
        });

        resolve(editor);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function disposeMonacoEditor(editorInstance) {
  if (editorInstance && typeof editorInstance.dispose === 'function') {
    editorInstance.dispose();
    return true;
  }
  return false;
}

function getMonacoEditorElements() {
  return document.querySelectorAll('[id^="monaco-editor-"]');
}