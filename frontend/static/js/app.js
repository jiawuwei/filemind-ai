const { createApp } = Vue

// Configure marked
marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Allow line breaks
    highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-'
})

createApp({
    data() {
        return {
            selectedFile: null,
            selectedModel: '',
            pages: '',
            models: [],
            error: null,
            isConverting: false,
            isDragging: false,
            convertSuccess: false,
            maxFileSize: 100 * 1024 * 1024, // 100MB
            validationErrors: {
                file: null,
                model: null,
                pages: null
            },
            showValidation: false,
            abortController: null,
            markdownContent: '',  // Add markdown content
            showExportMenu: false,
            copySuccess: false,
            pdfDoc: null,
            currentPage: 1,
            totalPages: 0
        }
    },
    computed: {
        canConvert() {
            // Add debugging information
            console.log('Validation status:', {
                hasFile: !!this.selectedFile,
                hasModel: !!this.selectedModel,
                notConverting: !this.isConverting,
                fileSizeOk: this.selectedFile ? this.selectedFile.size <= this.maxFileSize : false,
                noValidationErrors: !this.hasValidationErrors
            });

            return this.selectedFile &&
                this.selectedModel &&
                !this.isConverting &&
                this.selectedFile.size <= this.maxFileSize &&
                !this.hasValidationErrors
        },
        hasValidationErrors() {
            const errors = Object.values(this.validationErrors).some(error => error !== null);
            console.log('Validation errors:', this.validationErrors);
            return errors;
        },
        fileError() {
            if (!this.showValidation) return null;
            if (!this.selectedFile) return 'Please select a file';
            if (this.selectedFile.size > this.maxFileSize) {
                return 'File size exceeds 100MB limit';
            }
            return null;
        },
        modelError() {
            if (!this.showValidation) return null;
            if (!this.selectedModel) return 'Please select a model';
            return null;
        },
        pageError() {
            if (!this.showValidation) return null
            if (!this.pages) return null
            // Validate page format
            if (this.pages.includes('-')) {
                const [start, end] = this.pages.split('-').map(Number)
                if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
                    return 'Invalid page range format (e.g., use 1-5)'
                }
            } else {
                const pageList = this.pages.split(',').map(p => parseInt(p.trim()))
                if (pageList.some(isNaN) || pageList.some(p => p < 1)) {
                    return 'Invalid page format (e.g., use 1,2,3)'
                }
            }
            return null
        },
        markdownHtml() {
            if (!this.markdownContent) return ''
            try {
                return marked.parse(this.markdownContent)
            } catch (e) {
                console.error('Markdown parsing error:', e)
                return '<div class="text-red-500">Error parsing markdown content</div>'
            }
        }
    },
    methods: {
        async loadModels() {
            try {
                const response = await fetch('/api/models')
                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.detail || 'Failed to load models')
                }
                const data = await response.json()
                if (!data || !data.vendors) {
                    throw new Error('Invalid model data format')
                }
                this.models = data.vendors
                if (this.models.length === 0) {
                    throw new Error('No AI models available')
                }
            } catch (error) {
                this.error = error.message
            }
        },
        handleFileSelect(event) {
            const file = event.target.files[0]
            if (file) {
                this.selectedFile = file
                this.convertSuccess = false
                const fileName = this.selectedFile.name.toLowerCase();
                if (this.showValidation) {
                    this.updateValidationErrors()
                }
                // Clear existing preview
                this.clearPreview()
                
                if (file.type === 'application/pdf') {
                    this.loadPdf(file)
                } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    this.loadDoc(file)
                } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                    this.previewExcel();
                }
                else if (file.type.startsWith('image/')) {
                    this.loadImage(file)
                } else {
                    console.warn('Unsupported file type:', file.type)
                    this.error = 'Unsupported file type for preview. You can still convert this file.'
                }
            }
        },
        handleFileDrop(event) {
            this.isDragging = false
            const file = event.dataTransfer.files[0]
            if (file) {
                this.selectedFile = file
                this.convertSuccess = false
                if (this.showValidation) {
                    this.updateValidationErrors()
                }
                // Clear existing preview
                this.clearPreview()
                
                if (file.type === 'application/pdf') {
                    this.loadPdf(file)
                }
            }
        },
        async loadPdf(file) {
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
                const typedarray = new Uint8Array(e.target.result);
                this.pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                this.totalPages = this.pdfDoc.numPages;
                this.currentPage = 1;
                this.renderPage(this.currentPage);
            };
            fileReader.readAsArrayBuffer(file);
        },
        async loadDoc(file) {
            docx.renderAsync(file, document.getElementById("file-preview"))
                .then(x => console.log("docx: finished"));
        },
        async loadImage(file) {
            const container = document.getElementById('file-preview');
            // Clear existing content
            container.innerHTML = '';

            const img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '0 auto';

            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);

            container.appendChild(img);
        },

        clearPreview() {
            const container = document.getElementById('file-preview');
            
            // Clear PDF viewer
            if (this.pdfDoc) {
                this.pdfDoc = null;
                this.currentPage = 1;
                this.totalPages = 0;
            }
            
            // Clear Excel preview
            if (this.luckysheetInstance) {
                luckysheet.destroy();
                this.luckysheetInstance = null;
            }
            
            // Clear container content
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            
            // Reset container style
            container.style.height = '';
            
            // Add canvas back for PDF preview
            const canvas = document.createElement('canvas');
            canvas.id = 'pdf-canvas';
            container.appendChild(canvas);
        },

        async previewExcel() {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Convert Excel data to LuckySheet format
                    const luckySheetData = [];

                    workbook.SheetNames.forEach((sheetName) => {
                        const worksheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                        luckySheetData.push({
                            name: sheetName,
                            data: jsonData.map(row =>
                                row.map(cell => ({ v: cell }))
                            ),
                            status: 1
                        });
                    });

                    // Initialize LuckySheet
                    const container = document.getElementById('file-preview');
                    container.style.height = '100%';

                    this.luckysheetInstance = luckysheet.create({
                        container: 'file-preview',
                        data: luckySheetData,
                        showinfobar: false,
                        showsheetbar: true,
                        showstatisticBar: false,
                        allowCopy: true,
                        showtoolbar: false,
                        enableAddRow: false,
                        enableAddCol: false
                    });
                } catch (error) {
                    console.error('Excel preview error:', error);
                    this.error = 'Failed to preview Excel file: ' + error.message;
                }
            };

            reader.onerror = () => {
                this.error = 'Failed to read Excel file';
            };

            reader.readAsArrayBuffer(this.selectedFile);
        },
        async renderPage(pageNumber) {
            const page = await this.pdfDoc.getPage(pageNumber);
            const canvas = document.getElementById('pdf-canvas');
            const container = document.getElementById('file-preview');

            // Get container's available width (minus padding)
            const containerWidth = container.clientWidth - 32; // Subtract 16px padding on each side

            // Get original dimensions of the PDF page
            const originalViewport = page.getViewport({ scale: 1 });

            // Calculate scaling ratio to fit container width
            const scale = containerWidth / originalViewport.width;

            // Use calculated scaling ratio to create new viewport
            const viewport = page.getViewport({ scale });

            // Set canvas dimensions
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF page
            const renderContext = {
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            };

            try {
                await page.render(renderContext).promise;
            } catch (error) {
                console.error('Error rendering PDF page:', error);
                this.error = 'Cannot render PDF page';
            }
        },
        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.renderPage(this.currentPage);
            }
        },
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderPage(this.currentPage);
            }
        },
        updateValidationErrors() {
            this.validationErrors = {
                file: this.fileError,
                model: this.modelError,
                pages: this.pageError
            }
            console.log('Updated validation errors:', this.validationErrors);
            // Show only the first error
            const firstError = Object.values(this.validationErrors).find(error => error !== null)
            if (firstError) {
                console.log('Found validation error:', firstError);
                this.error = firstError;
            } else {
                this.error = null;
            }
        },
        validateBeforeConvert() {
            console.log('Starting validation before convert');
            this.showValidation = true;
            this.updateValidationErrors();
            if (this.hasValidationErrors) {
                console.log('Validation failed:', this.error);
                throw new Error(this.error || 'Validation failed');
            }
            console.log('Validation passed');
        },
        async convertFile() {
            console.log('Convert button clicked');
            console.log('Current state:', {
                selectedFile: !!this.selectedFile,
                selectedModel: this.selectedModel,
                isConverting: this.isConverting,
                hasValidationErrors: this.hasValidationErrors,
                canConvert: this.canConvert
            });

            try {
                this.validateBeforeConvert();
                if (!this.canConvert) {
                    console.log('Cannot convert - validation failed');
                    return;
                }

                this.isConverting = true;
                this.error = null;
                this.convertSuccess = false;
                this.markdownContent = '';  // Clear previous content
                this.abortController = new AbortController();

                const formData = new FormData()
                formData.append('file', this.selectedFile)
                formData.append('model_id', this.selectedModel)
                if (this.pages) {
                    formData.append('pages', this.pages)
                }

                const response = await fetch('/api/convert', {
                    method: 'POST',
                    body: formData,
                    signal: this.abortController.signal
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.detail || 'Conversion failed')
                }

                const blob = await response.blob()
                if (blob.size === 0) {
                    throw new Error('Conversion failed: empty result')
                }

                // Save file
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${this.selectedFile.name.split('.')[0]}_converted.md`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)

                // Show preview
                this.markdownContent = await blob.text()

                this.convertSuccess = true
                this.showValidation = false
                setTimeout(() => {
                    this.convertSuccess = false
                }, 5000)
            } catch (error) {
                if (error.name === 'AbortError') {
                    this.error = 'Conversion stopped'
                } else {
                    this.error = error.message
                }
            } finally {
                this.isConverting = false
                this.abortController = null
            }
        },
        handleModelSelect(model) {
            this.selectedModel = model.model_id
            if (this.showValidation) {
                this.updateValidationErrors()
            }
        },
        stopConversion() {
            if (this.abortController) {
                this.abortController.abort()
            }
        },
        toggleExportMenu() {
            this.showExportMenu = !this.showExportMenu
            // Click outside to close menu
            if (this.showExportMenu) {
                setTimeout(() => {
                    const closeMenu = (e) => {
                        if (!e.target.closest('.dropdown')) {
                            this.showExportMenu = false
                            document.removeEventListener('click', closeMenu)
                        }
                    }
                    document.addEventListener('click', closeMenu)
                }, 0)
            }
        },
        async copyMarkdown() {
            try {
                await navigator.clipboard.writeText(this.markdownContent)
                this.showExportMenu = false
                this.copySuccess = true
                this.error = null
                // Show temporary success message
                this.convertSuccess = true
                setTimeout(() => {
                    this.convertSuccess = false
                }, 2000)
            } catch (err) {
                this.error = 'Copy failed, please try again'
            }
        },
        downloadMarkdown() {
            const blob = new Blob([this.markdownContent], { type: 'text/markdown' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${this.selectedFile.name.split('.')[0]}_converted.md`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
            this.showExportMenu = false
        },
        async downloadWord() {
            try {
                // Convert Markdown to HTML
                const htmlContent = marked.parse(this.markdownContent);

                // Create full HTML document
                const fullHtml = `
                    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                    <head>
                        <meta charset="utf-8">
                        <title>Exported Document</title>
                        <style>
                            body { font-family: Arial, sans-serif; }
                            pre { background-color: #f6f8fa; padding: 16px; white-space: pre-wrap; }
                            code { background-color: #f6f8fa; padding: 2px 4px; }
                            table { border-collapse: collapse; width: 100%; }
                            th, td { border: 1px solid #ddd; padding: 8px; }
                            img { max-width: 100%; }
                            blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; }
                        </style>
                    </head>
                    <body>
                        ${htmlContent}
                    </body>
                    </html>
                `;

                // Create Blob
                const blob = new Blob([fullHtml], {
                    type: 'application/msword;charset=utf-8'
                });

                // Download file
                const fileName = `${this.selectedFile.name.split('.')[0]}_converted.doc`;
                saveAs(blob, fileName);

                this.showExportMenu = false;
                this.convertSuccess = true;
                setTimeout(() => {
                    this.convertSuccess = false;
                }, 2000);
            } catch (err) {
                console.error('Word export error:', err);
                this.error = 'Word export failed: ' + err.message;
            }
        },

    },
    watch: {
        selectedModel() {
            if (this.showValidation) {
                this.updateValidationErrors()
            }
        },
        pages() {
            if (this.showValidation) {
                this.updateValidationErrors()
            }
        },
        selectedFile() {
            if (this.showValidation) {
                this.updateValidationErrors()
            }
        }
    },
    mounted() {
        this.loadModels()
        window.addEventListener('resize', this.handleResize)
        // Click ESC to close export menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.showExportMenu) {
                this.showExportMenu = false
            }
        })
    },
    beforeUnmount() {
        window.removeEventListener('resize', this.handleResize)
    },
    handleResize() {
        if (this.pdfDoc && this.currentPage) {
            this.renderPage(this.currentPage)
        }
    }
}).mount('#app')