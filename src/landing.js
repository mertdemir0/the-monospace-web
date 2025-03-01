// Landing page specific functionality
document.addEventListener('DOMContentLoaded', function() {
    const popupContainer = document.getElementById('popup-container');
    let currentPopup = null;
    let popupTimeout = null;

    // Function to escape HTML special characters
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, function(match) {
            const escapeMap = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return escapeMap[match];
        });
    }

    // Create popup element
    function createPopup(content, x, y) {
        const popup = document.createElement('div');
        popup.className = 'popup';
        popup.innerHTML = `
            <div class="popup-content">
                ${content}
            </div>
        `;

        // Position the popup
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Initial positioning
        popup.style.left = x + 'px';
        popup.style.top = y + 'px';

        // Add to container
        popupContainer.innerHTML = '';
        popupContainer.appendChild(popup);

        // Adjust position if needed
        const rect = popup.getBoundingClientRect();
        
        // Adjust horizontal position
        if (x + rect.width > viewportWidth) {
            popup.style.left = (x - rect.width) + 'px';
        }
        
        // Adjust vertical position
        if (y + rect.height > viewportHeight) {
            popup.style.top = (viewportHeight - rect.height - 10) + 'px';
        }

        return popup;
    }

    // Show popup
    function showPopup(link, event) {
        const rect = link.getBoundingClientRect();
        const x = event.clientX + 15;
        const y = event.clientY + 15;

        // Extract metadata
        const title = link.querySelector('.article-title')?.textContent || '';
        const subtitle = link.querySelector('.article-subtitle')?.textContent || '';
        const date = link.querySelector('.article-date')?.textContent || '';
        const category = link.dataset.category || '';
        const confidence = link.className.includes('confidence-high') ? 'High' :
                         link.className.includes('confidence-medium') ? 'Medium' :
                         link.className.includes('confidence-low') ? 'Low' : '';

        // Create popup content
        const content = `
            <h3>${escapeHTML(title)}</h3>
            ${subtitle ? `<p class="subtitle">${escapeHTML(subtitle)}</p>` : ''}
            ${date ? `<p class="date">${escapeHTML(date)}</p>` : ''}
            ${category ? `<p class="category">Category: ${escapeHTML(category)}</p>` : ''}
            ${confidence ? `<p class="confidence">Confidence: ${escapeHTML(confidence)}</p>` : ''}
        `;

        currentPopup = createPopup(content, x, y);
    }

    // Hide popup
    function hidePopup() {
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
    }

    // Add event listeners to all article links
    document.querySelectorAll('.article-link').forEach(link => {
        link.addEventListener('mouseenter', (event) => {
            clearTimeout(popupTimeout);
            if (!currentPopup) {
                showPopup(link, event);
            }
        });

        link.addEventListener('mouseleave', () => {
            clearTimeout(popupTimeout);
            popupTimeout = setTimeout(hidePopup, 300);
        });

        link.addEventListener('mousemove', (event) => {
            if (currentPopup) {
                const x = event.clientX + 15;
                const y = event.clientY + 15;
                
                // Update popup position
                const rect = currentPopup.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                let newX = x;
                let newY = y;
                
                if (x + rect.width > viewportWidth) {
                    newX = x - rect.width;
                }
                
                if (y + rect.height > viewportHeight) {
                    newY = viewportHeight - rect.height - 10;
                }
                
                currentPopup.style.left = newX + 'px';
                currentPopup.style.top = newY + 'px';
            }
        });
    });

    // Add event listeners to popup
    popupContainer.addEventListener('mouseenter', () => {
        clearTimeout(popupTimeout);
    });

    popupContainer.addEventListener('mouseleave', () => {
        clearTimeout(popupTimeout);
        popupTimeout = setTimeout(hidePopup, 300);
    });

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

    initializeURLGuessing();
});
