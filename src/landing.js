// Landing page specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize any landing page specific functionality here
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
