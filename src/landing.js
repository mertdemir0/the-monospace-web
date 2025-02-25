// Landing page specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize popups
    initializePopups();
    
    // Initialize URL guessing functionality
    initializeURLGuessing();
});

// Initialize popups
function initializePopups() {
    // Add popup functionality to all article links
    document.querySelectorAll('.article-link').forEach(link => {
        link.addEventListener('mouseenter', function(e) {
            const title = this.querySelector('.article-title')?.textContent || '';
            const subtitle = this.querySelector('.article-subtitle')?.textContent || '';
            const date = this.querySelector('.article-date')?.textContent || '';
            const category = this.dataset.category || '';
            const confidence = this.classList.contains('confidence-high') ? 'High' :
                             this.classList.contains('confidence-medium') ? 'Medium' : 'Low';
            
            // Create popup content
            const content = `
                <div class="popup-content">
                    <h3>${title}</h3>
                    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
                    ${date ? `<p class="date">${date}</p>` : ''}
                    ${category ? `<p class="category">Category: ${category}</p>` : ''}
                    ${confidence ? `<p class="confidence">Confidence: ${confidence}</p>` : ''}
                </div>
            `;
            
            // Position and show popup
            showPopup(content, e);
        });

        link.addEventListener('mouseleave', hidePopup);
    });
}

// Show popup with content
function showPopup(content, event) {
    let popup = document.querySelector('.popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.className = 'popup';
        document.getElementById('popup-container').appendChild(popup);
    }

    // Set content and position
    popup.innerHTML = content;
    positionPopup(popup, event);
    
    // Show with fade effect
    popup.style.opacity = '0';
    popup.style.display = 'block';
    setTimeout(() => popup.style.opacity = '1', 10);
}

// Position popup relative to mouse/target
function positionPopup(popup, event) {
    const rect = event.target.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    
    let left = rect.left;
    let top = rect.bottom + 10;

    // Keep popup within viewport
    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - 10;
    }
    if (top + popupRect.height > window.innerHeight) {
        top = rect.top - popupRect.height - 10;
    }

    // Ensure popup stays within viewport bounds
    left = Math.max(10, Math.min(left, window.innerWidth - popupRect.width - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - popupRect.height - 10));

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

// Hide popup
function hidePopup() {
    const popup = document.querySelector('.popup');
    if (popup) {
        popup.style.opacity = '0';
        setTimeout(() => {
            popup.style.display = 'none';
            popup.innerHTML = '';
        }, 250);
    }
}

// URL guessing functionality
function initializeURLGuessing() {
    // Get all article links
    const articleLinks = Array.from(document.querySelectorAll('#categories a')).map(link => ({
        url: link.getAttribute('href'),
        title: link.textContent,
        element: link
    }));

    // Function to find nearest matching URLs
    function findNearestURLs(currentPath) {
        const results = [];
        
        // Remove leading/trailing slashes for comparison
        currentPath = currentPath.replace(/^\/+|\/+$/g, '');
        
        // Score each URL based on similarity
        const scored = articleLinks.map(link => {
            const linkPath = link.url.replace(/^\/+|\/+$/g, '');
            const score = calculateSimilarity(currentPath, linkPath);
            return { ...link, score };
        });

        // Sort by score (highest first) and take top 5
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .filter(item => item.score > 0.3); // Only return reasonably similar matches
    }

    // Calculate similarity between two strings (0-1)
    function calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        // Calculate Levenshtein distance
        const costs = [];
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                        newValue = Math.min(
                            Math.min(newValue, lastValue),
                            costs[j]
                        ) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[shorter.length] = lastValue;
        }
        return (longer.length - costs[shorter.length]) / longer.length;
    }

    // Update URL suggestions when path changes
    function updateURLSuggestions() {
        const currentPath = window.location.pathname;
        const nearestURLs = findNearestURLs(currentPath);
        
        // Create or update suggestions container
        let suggestionsContainer = document.getElementById('url-suggestions');
        if (!suggestionsContainer) {
            suggestionsContainer = document.createElement('div');
            suggestionsContainer.id = 'url-suggestions';
            document.querySelector('#categories').appendChild(suggestionsContainer);
        }

        // Only show if we have suggestions and we're not on an existing page
        if (nearestURLs.length > 0 && !articleLinks.some(link => link.url === currentPath)) {
            suggestionsContainer.innerHTML = `
                <h3>Nearest URLs to your current one (${currentPath}):</h3>
                <ul>
                    ${nearestURLs.map(item => `
                        <li>
                            <a href="${item.url}">${item.title}</a>
                            (${Math.round(item.score * 100)}% match)
                        </li>
                    `).join('')}
                </ul>
            `;
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    }

    // Listen for URL changes
    window.addEventListener('popstate', updateURLSuggestions);
    updateURLSuggestions(); // Initial check
}
