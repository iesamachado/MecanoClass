const Components = {
    renderFooter: () => {
        const footer = document.getElementById('app-footer');
        if (footer) {
            footer.innerHTML = `
                <footer class="bg-dark border-top border-secondary py-2 mt-auto">
                    <div class="container d-flex justify-content-between align-items-center">
                        <small class="text-dim">CC 2025 MecanoClass <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" class="text-dim text-decoration-none ms-1"> (CC BY-NC)</a></small>
                        <div class="small">
                            <a href="about.html" class="text-dim text-decoration-none me-3 hover-text-light">Sobre Nosotros</a>
                            <a href="privacy.html" class="text-dim text-decoration-none hover-text-light">Privacidad</a>
                        </div>
                    </div>
                </footer>
            `;
        }
    },

    renderHeader: (user = null, profile = null) => {
        const header = document.getElementById('app-header');
        if (!header) return;

        const path = window.location.pathname;
        const isIndex = path.endsWith('index.html') || path === '/';
        const isPractice = path.includes('practice.html');
        const isProfile = path.includes('profile.html');

        // Logo HTML
        const logoHtml = `
            <a class="navbar-brand d-flex align-items-center" href="index.html">
                <img src="img/logo.png" alt="MecanoClass" style="height: 60px; object-fit: contain;">
            </a>
        `;

        let contentHtml = '';

        if (isPractice) {
            // Minimal Header for Practice
            contentHtml = `
                <div class="d-flex align-items-center gap-3">
                    <button onclick="window.history.back()" class="btn btn-outline-light btn-sm">
                        <i class="bi bi-arrow-left me-2"></i>Volver
                    </button>
                </div>
            `;
        } else if (user && profile) {
            // Full App Header (Teacher/Student)
            const isTeacher = profile.role === 'teacher';
            const statsHtml = isTeacher
                ? `<!-- Teacher Stats (Header) -->
                   <div id="headerStats" class="d-none d-md-flex align-items-center gap-3 me-2 border-end border-secondary pe-3">
                       <span title="PPM (Últimos 10)"><i class="bi bi-speedometer2 text-primary me-1"></i> <span id="headerWpm" class="text-light fw-bold">--</span> <small class="text-dim">PPM</small></span>
                       <span title="Precisión (Últimos 10)"><i class="bi bi-bullseye text-info me-1"></i> <span id="headerAcc" class="text-light fw-bold">--</span> <small class="text-dim">%</small></span>
                   </div>`
                : `<!-- Student Stats -->
                   <div id="headerStats" class="d-none d-md-flex align-items-center gap-3 me-2 border-end border-secondary pe-3">
                        <span title="Media PPM"><i class="bi bi-speedometer2 text-primary me-1"></i> <span id="headerWpm" class="text-light fw-bold">--</span></span>
                        <span title="Media Precisión"><i class="bi bi-bullseye text-info me-1"></i> <span id="headerAcc" class="text-light fw-bold">--</span></span>
                   </div>`;

            contentHtml = `
                <div class="d-flex align-items-center gap-3">
                    ${statsHtml}
                    <div class="d-flex align-items-center">
                        <a href="profile.html" class="text-decoration-none d-flex align-items-center" title="Editar Perfil">
                            <img src="${profile.photoURL || ''}" class="rounded-circle border border-white hover-scale" 
                                 style="width: 40px; height: 40px; transition: transform 0.2s;">
                            <span class="text-light ms-2 fw-bold hover-text-primary d-none d-sm-block">${profile.displayName || 'Usuario'}</span>
                        </a>
                    </div>
                    <button onclick="logout()" class="btn btn-outline-danger btn-sm" title="Cerrar Sesión"><i class="bi bi-box-arrow-right"></i></button>
                </div>
            `;
        } else {
            // Public Header - Empty (No Login Button)
            contentHtml = '';
        }

        header.innerHTML = `
            <nav class="navbar navbar-expand-lg navbar-dark bg-transparent py-3">
                <div class="container">
                    ${logoHtml}
                    <div class="d-flex align-items-center gap-3">
                        ${contentHtml}
                    </div>
                </div>
            </nav>
        `;
    }
};

// Auto-run Footer
document.addEventListener('DOMContentLoaded', () => {
    Components.renderFooter();
    // Header is rendered by auth.js or manual call once user is known?
    // Strategy: Render default header immediately. Re-render when auth changes.
    Components.renderHeader(); // Default
});

// Expose globally
window.Components = Components;
