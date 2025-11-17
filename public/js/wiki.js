/**
 * Wiki System for Pup Cid's Little TikTok Helper
 * Provides comprehensive documentation with markdown rendering, search, and navigation
 */

(() => {
    'use strict';

    // ========== STATE ==========
    let wikiStructure = null;
    let wikiCache = new Map();
    let currentPage = 'home';

    // ========== CONFIGURATION ==========
    const WIKI_API_BASE = '/api/wiki';

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        // Initialize when wiki view becomes active
        const wikiView = document.getElementById('view-wiki');
        if (!wikiView) return;

        // Set up observer to load wiki when view becomes active
        const observer = new MutationObserver(() => {
            if (wikiView.classList.contains('active') && !wikiStructure) {
                initializeWiki();
            }
        });

        observer.observe(wikiView, { attributes: true, attributeFilter: ['class'] });

        // Also check if it's already active
        if (wikiView.classList.contains('active')) {
            initializeWiki();
        }
    });

    // ========== WIKI INITIALIZATION ==========
    async function initializeWiki() {
        console.log('📚 [Wiki] Initializing wiki system...');

        try {
            // Load wiki structure
            const response = await fetch(`${WIKI_API_BASE}/structure`);
            if (!response.ok) throw new Error('Failed to load wiki structure');
            
            wikiStructure = await response.json();
            console.log('✅ [Wiki] Structure loaded:', wikiStructure);

            // Build navigation
            buildNavigation();

            // Set up search
            setupSearch();

            // Load home page by default
            await loadPage('home');

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } catch (error) {
            console.error('❌ [Wiki] Initialization failed:', error);
            showError('Failed to load wiki. Please try again later.');
        }
    }

    // ========== NAVIGATION ==========
    function buildNavigation() {
        const navContainer = document.getElementById('wiki-nav');
        if (!navContainer) return;

        navContainer.innerHTML = '';

        // Create navigation structure
        wikiStructure.sections.forEach(section => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'wiki-nav-section';

            // Section header
            const headerEl = document.createElement('div');
            headerEl.className = 'wiki-nav-section-header';
            headerEl.innerHTML = `
                <i data-lucide="${section.icon || 'folder'}"></i>
                <span>${section.title}</span>
                <i data-lucide="chevron-down" class="wiki-nav-chevron"></i>
            `;
            headerEl.addEventListener('click', () => {
                sectionEl.classList.toggle('collapsed');
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });

            sectionEl.appendChild(headerEl);

            // Section items
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'wiki-nav-items';

            section.pages.forEach(page => {
                const itemEl = document.createElement('a');
                itemEl.className = 'wiki-nav-item';
                itemEl.href = '#';
                itemEl.dataset.page = page.id;
                itemEl.innerHTML = `
                    <i data-lucide="${page.icon || 'file-text'}"></i>
                    <span>${page.title}</span>
                `;
                itemEl.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await loadPage(page.id);
                });

                itemsContainer.appendChild(itemEl);
            });

            sectionEl.appendChild(itemsContainer);
            navContainer.appendChild(sectionEl);
        });

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== PAGE LOADING ==========
    async function loadPage(pageId) {
        console.log(`📄 [Wiki] Loading page: ${pageId}`);
        currentPage = pageId;

        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;

        // Show loading state
        articleContainer.innerHTML = `
            <div class="wiki-loading">
                <i data-lucide="loader"></i>
                <span>Loading...</span>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            // Check cache first
            let content;
            if (wikiCache.has(pageId)) {
                content = wikiCache.get(pageId);
            } else {
                // Fetch from server
                const response = await fetch(`${WIKI_API_BASE}/page/${pageId}`);
                if (!response.ok) throw new Error(`Failed to load page: ${pageId}`);
                
                content = await response.json();
                wikiCache.set(pageId, content);
            }

            // Render content
            renderPage(content);

            // Update active state in navigation
            updateActiveNav(pageId);

            // Scroll to top
            articleContainer.scrollTop = 0;

        } catch (error) {
            console.error(`❌ [Wiki] Failed to load page ${pageId}:`, error);
            showError(`Failed to load page. Please try again.`);
        }
    }

    function renderPage(content) {
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;

        // Create article structure
        const article = document.createElement('article');
        article.className = 'wiki-article-content';

        // Add breadcrumb
        if (content.breadcrumb && content.breadcrumb.length > 0) {
            const breadcrumb = document.createElement('nav');
            breadcrumb.className = 'wiki-breadcrumb';
            breadcrumb.innerHTML = content.breadcrumb.map((item, index) => {
                if (index === content.breadcrumb.length - 1) {
                    return `<span>${item.title}</span>`;
                }
                return `<a href="#" data-page="${item.id}">${item.title}</a>`;
            }).join('<i data-lucide="chevron-right"></i>');
            
            // Add click handlers
            breadcrumb.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await loadPage(e.target.dataset.page);
                });
            });
            
            article.appendChild(breadcrumb);
        }

        // Add title
        const title = document.createElement('h1');
        title.className = 'wiki-page-title';
        title.textContent = content.title;
        article.appendChild(title);

        // Add table of contents if available
        if (content.toc && content.toc.length > 0) {
            const tocContainer = document.createElement('div');
            tocContainer.className = 'wiki-toc';
            tocContainer.innerHTML = `
                <h2>Table of Contents</h2>
                <nav class="wiki-toc-nav">
                    ${buildTOC(content.toc)}
                </nav>
            `;
            article.appendChild(tocContainer);
        }

        // Add main content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'wiki-markdown-content';
        contentDiv.innerHTML = content.html;
        article.appendChild(contentDiv);

        // Add footer with metadata
        if (content.lastUpdated) {
            const footer = document.createElement('div');
            footer.className = 'wiki-article-footer';
            footer.innerHTML = `
                <div class="wiki-meta">
                    <i data-lucide="clock"></i>
                    <span>Last updated: ${new Date(content.lastUpdated).toLocaleDateString()}</span>
                </div>
            `;
            article.appendChild(footer);
        }

        articleContainer.innerHTML = '';
        articleContainer.appendChild(article);

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Set up internal link handlers
        setupInternalLinks(articleContainer);

        // Set up image viewers
        setupImageViewers(articleContainer);
    }

    function buildTOC(toc) {
        return `<ul>${toc.map(item => `
            <li>
                <a href="#${item.id}">${item.text}</a>
                ${item.children && item.children.length > 0 ? buildTOC(item.children) : ''}
            </li>
        `).join('')}</ul>`;
    }

    function updateActiveNav(pageId) {
        // Remove all active states
        document.querySelectorAll('.wiki-nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active state to current page
        const activeItem = document.querySelector(`.wiki-nav-item[data-page="${pageId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            
            // Expand parent section if collapsed
            const section = activeItem.closest('.wiki-nav-section');
            if (section) {
                section.classList.remove('collapsed');
            }
        }
    }

    function setupInternalLinks(container) {
        // Handle internal wiki links
        container.querySelectorAll('a[href^="#"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href.startsWith('#wiki:')) {
                const pageId = href.replace('#wiki:', '');
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await loadPage(pageId);
                });
            }
        });
    }

    function setupImageViewers(container) {
        // Add click handlers to images for lightbox view
        container.querySelectorAll('img').forEach(img => {
            img.addEventListener('click', () => {
                showImageModal(img.src, img.alt);
            });
        });
    }

    // ========== SEARCH ==========
    function setupSearch() {
        const searchInput = document.getElementById('wiki-search');
        if (!searchInput) return;

        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value);
            }, 300);
        });
    }

    async function performSearch(query) {
        if (!query || query.trim().length < 2) {
            // Clear search results
            hideSearchResults();
            return;
        }

        console.log(`🔍 [Wiki] Searching for: ${query}`);

        try {
            const response = await fetch(`${WIKI_API_BASE}/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Search failed');

            const results = await response.json();
            displaySearchResults(results);
        } catch (error) {
            console.error('❌ [Wiki] Search failed:', error);
        }
    }

    function displaySearchResults(results) {
        let resultsContainer = document.getElementById('wiki-search-results');
        
        if (!resultsContainer) {
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'wiki-search-results';
            resultsContainer.className = 'wiki-search-results';
            
            const searchContainer = document.querySelector('.wiki-search-container');
            if (searchContainer) {
                searchContainer.appendChild(resultsContainer);
            }
        }

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="wiki-search-no-results">
                    <i data-lucide="search-x"></i>
                    <span>No results found</span>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = results.map(result => `
                <a href="#" class="wiki-search-result" data-page="${result.id}">
                    <div class="wiki-search-result-title">${highlightMatch(result.title, result.matches)}</div>
                    <div class="wiki-search-result-excerpt">${highlightMatch(result.excerpt, result.matches)}</div>
                </a>
            `).join('');

            // Add click handlers
            resultsContainer.querySelectorAll('.wiki-search-result').forEach(result => {
                result.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await loadPage(result.dataset.page);
                    hideSearchResults();
                    document.getElementById('wiki-search').value = '';
                });
            });
        }

        resultsContainer.style.display = 'block';
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function hideSearchResults() {
        const resultsContainer = document.getElementById('wiki-search-results');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }

    function highlightMatch(text, matches) {
        if (!matches || matches.length === 0) return text;
        
        // Simple highlight implementation
        let highlighted = text;
        matches.forEach(match => {
            const regex = new RegExp(`(${match})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark>$1</mark>');
        });
        return highlighted;
    }

    // ========== IMAGE MODAL ==========
    function showImageModal(src, alt) {
        // Remove existing modal if any
        const existing = document.getElementById('wiki-image-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'wiki-image-modal';
        modal.className = 'wiki-image-modal';
        modal.innerHTML = `
            <div class="wiki-image-modal-backdrop"></div>
            <div class="wiki-image-modal-content">
                <button class="wiki-image-modal-close">
                    <i data-lucide="x"></i>
                </button>
                <img src="${src}" alt="${alt || ''}">
                <div class="wiki-image-modal-caption">${alt || ''}</div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        const close = () => {
            modal.remove();
        };

        modal.querySelector('.wiki-image-modal-close').addEventListener('click', close);
        modal.querySelector('.wiki-image-modal-backdrop').addEventListener('click', close);

        // ESC key handler
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== ERROR HANDLING ==========
    function showError(message) {
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;

        articleContainer.innerHTML = `
            <div class="wiki-error">
                <i data-lucide="alert-circle"></i>
                <h2>Error</h2>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">
                    <i data-lucide="refresh-cw"></i>
                    Reload Page
                </button>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== EXPORT ==========
    window.WikiSystem = {
        loadPage,
        getCurrentPage: () => currentPage
    };
})();
