/*  SVG icons for various UI elements.
 */
if (typeof window.GW == "undefined")
    window.GW = { };

GW.svg = (name) => {
    const icons = {
        'close': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 3.5l9 9m-9 0l9-9"/></svg>`,
        'pin': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M4.5 4.5l7 7m-3.5-10v13"/></svg>`,
        'unpin': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M4.5 4.5l7 7m-3.5-10v13"/></svg>`,
        'zoom': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>`,
        'minimize': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3 8h10"/></svg>`,
        'options': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="2.5" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13.5" r="1.5"/></svg>`,
        'maximize': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 3.5h9v9h-9z"/></svg>`,
        'restore': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 6.5v-3h3m6 3v-3h-3m-6 6v3h3m6-3v3h-3"/></svg>`,
        'collapse': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5"/></svg>`,
        'uncollapse': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3 10l5-5 5 5"/></svg>`
    };
    return icons[name] || '';
};
