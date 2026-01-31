// Frappe Animation Disabler - Inject this JavaScript to disable animations
// This improves loading performance significantly

(function() {
    'use strict';
    
    // Disable CSS animations via style injection
    const style = document.createElement('style');
    style.textContent = `
        *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
            scroll-behavior: auto !important;
        }
    `;
    document.head.appendChild(style);
    
    // Override requestAnimationFrame to prevent animations
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
        // Only allow essential callbacks, skip animation callbacks
        if (callback && typeof callback === 'function') {
            // Execute immediately without animation timing
            setTimeout(callback, 0);
        }
        return 0;
    };
    
    // Disable CSS transitions on all elements
    const disableTransitions = () => {
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            el.style.transition = 'none';
            el.style.animation = 'none';
        });
    };
    
    // Run immediately and on DOM changes
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', disableTransitions);
    } else {
        disableTransitions();
    }
    
    // Watch for new elements
    const observer = new MutationObserver(() => {
        disableTransitions();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('✅ Frappe animations disabled for performance');
})();

