// Landing page specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize any landing page specific functionality here
    // Initialize URL guessing functionality
    initializeURLGuessing();
});

// Initialize popups when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize popup system
    Popups.setup();

    // Add popup functionality to all links
    document.querySelectorAll('a').forEach(link => {
        if (!link.closest('.sidebar-box') && !link.closest('footer')) {
            Popups.addTarget(link, () => {
                return {
                    url: link.href,
                    title: link.textContent
                };
            });
        }
    });
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
