const AppUI = {
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

    calculateAverages: (results) => {
        if (!results || results.length === 0) return { wpm: 0, accuracy: 0 };
        const totalWpm = results.reduce((sum, r) => sum + (r.wpm || 0), 0);
        const totalAcc = results.reduce((sum, r) => sum + (r.accuracy || 0), 0);
        return {
            wpm: Math.round(totalWpm / results.length),
            accuracy: Math.round(totalAcc / results.length)
        };
    },

    fetchAndRenderStats: async (userId, role) => {
        if (!userId) return;

        try {
            // Re-use logic from db.js (assumes global scope access or we rely on getStudentResults being global)
            // Ideally we'd move getStudentResults to a shared module or ensure it's loaded.
            // checking if getStudentResults is defined
            if (typeof getStudentResults === 'function') {
                const allResults = await getStudentResults(userId, 50); // Get last 50 for good average
                const results = allResults.filter(r => (r.accuracy || 0) >= 90);
                const stats = AppUI.calculateAverages(results);

                const wpmEl = document.getElementById('headerWpm');
                const accEl = document.getElementById('headerAcc');

                if (wpmEl) wpmEl.innerText = stats.wpm;
                if (accEl) accEl.innerText = stats.accuracy;
            }
        } catch (e) {
            console.error("Error updating header stats:", e);
        }
    },

    renderHeader: async (user = null, profile = null) => {
        const header = document.getElementById('app-header');
        if (!header) return;

        const path = window.location.pathname;
        const isPractice = path.includes('practice.html');
        // Simple heuristic for 'public' pages where we might not want the full interaction or different layout
        // But requested to be consistent.

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
            const statsHtml = `
                   <div id="headerStats" class="d-none d-md-flex align-items-center gap-3 me-2 border-end border-secondary pe-3" style="min-width: 150px; justify-content: flex-end;">
                       <span title="Media PPM"><i class="bi bi-speedometer2 text-primary me-1"></i> <span id="headerWpm" class="text-light fw-bold">--</span> <small class="text-dim">PPM</small></span>
                       <span title="Media Precisión"><i class="bi bi-bullseye text-info me-1"></i> <span id="headerAcc" class="text-light fw-bold">--</span> <small class="text-dim">%</small></span>
                   </div>`;

            const adminLink = (profile.isAdmin || profile.role === 'admin')
                ? `<a href="admin.html" class="btn btn-outline-warning btn-sm me-2" title="Panel de Administración"><i class="bi bi-shield-lock-fill me-1"></i>Admin</a>`
                : '';

            const teacherLink = (profile.role === 'teacher')
                ? `<a href="dashboard_teacher.html" class="btn btn-outline-info btn-sm me-2" title="Panel Docente"><i class="bi bi-easel me-1"></i>Panel</a>`
                : '';

            contentHtml = `
                <div class="d-flex align-items-center gap-3">
                    ${(profile.role === 'student' || isTeacher) ? statsHtml : ''}
                    ${teacherLink}
                    ${adminLink}
                    <div class="d-flex align-items-center">
                        <a href="profile.html" class="text-decoration-none d-flex align-items-center" title="Editar Perfil">
                            <img src="${profile.photoURL || 'img/default-avatar.png'}" class="rounded-circle border border-white hover-scale" 
                                 style="width: 40px; height: 40px; transition: transform 0.2s;" onerror="this.src='https://via.placeholder.com/40'">
                            <span class="text-light ms-2 fw-bold hover-text-primary d-none d-sm-block">${profile.displayName || 'Usuario'}</span>
                        </a>
                    </div>
                    <button onclick="logout()" class="btn btn-outline-danger btn-sm" title="Cerrar Sesión"><i class="bi bi-box-arrow-right"></i></button>
                </div>
            `;

            // Trigger stats fetch
            // We do this AFTER rendering initial HTML so we have the elements to update
            setTimeout(() => AppUI.fetchAndRenderStats(user.uid, profile.role), 0);

        } else {
            // Public Header - Login Button
            contentHtml = `
                <div class="d-flex align-items-center gap-3">
                    <a href="#" onclick="initiateLogin(null)" class="btn btn-primary">Iniciar Sesión</a>
                </div>
            `;
        }

        header.innerHTML = `
            <nav class="navbar navbar-expand-lg navbar-dark bg-transparent py-3">
                <div class="container">
                    ${logoHtml}
                    <!-- Mobile Toggle -->
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    
                    <div class="collapse navbar-collapse justify-content-end" id="navbarContent">
                        <div class="d-flex align-items-center gap-3 mt-3 mt-lg-0">
                            ${contentHtml}
                        </div>
                    </div>
                </div>
            </nav>
        `;
    },
    injectFavicon: () => {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = 'img/logo.png';
        link.type = 'image/png';
    }
};

// Auto-run Footer
document.addEventListener('DOMContentLoaded', () => {
    AppUI.injectFavicon();
    AppUI.renderFooter();
    AppUI.renderHeader(); // Default empty
});

// Expose globally
window.AppUI = AppUI;
