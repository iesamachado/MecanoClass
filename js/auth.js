// Authentication Logic

let selectedRole = null; // Store role for new sign-ups

// Listen for auth state changes
auth.onAuthStateChanged(async (user) => {
    if (user) {
        //  console.log("User logged in:", user.uid);
        // User is signed in.
        // Check if profile exists, if not create it with selectedRole
        // If selectedRole is null (reload), we just fetch existing role

        let profile = await getUserProfile(user.uid);

        if (!profile && selectedRole) {
            console.log("Creating new profile for role:", selectedRole);
            profile = await createUserProfile(user, selectedRole);
        } else if (!profile && !selectedRole) {
            // Edge case: User logged in but no profile and no role selected (shouldn't happen in normal flow)
            console.warn("User logged in but no profile found.");
            // Force logout or redirect to role selection?
            // For now, let's sign them out to restart flow
            await auth.signOut();
            return;
        }

        // Redirect based on role if not already on the correct page
        const currentPage = window.location.pathname;

        if (profile.role === 'teacher' && !currentPage.includes('dashboard_teacher.html') && !currentPage.includes('dashboard_class_details.html') && !currentPage.includes('live_host.html') && !currentPage.includes('practice.html') && !currentPage.includes('profile.html') && !currentPage.includes('about.html') && !currentPage.includes('privacy.html') && !currentPage.includes('admin.html') && !currentPage.includes('admin_setup.html') && !currentPage.includes('class_student_details.html')) {
            window.location.href = 'dashboard_teacher.html';
        } else if (profile.role === 'student' && !currentPage.includes('dashboard_student.html') && !currentPage.includes('practice.html') && !currentPage.includes('live_player.html') && !currentPage.includes('profile.html') && !currentPage.includes('about.html') && !currentPage.includes('privacy.html') && !currentPage.includes('admin.html') && !currentPage.includes('admin_setup.html')) {
            window.location.href = 'dashboard_student.html';
        }

        // Render Header
        if (window.AppUI) window.AppUI.renderHeader(user, profile);

    } else {
        // User is signed out.
        console.log("User signed out.");
        if (window.AppUI) window.AppUI.renderHeader(null, null);
    }
});

function initiateLogin(role) {
    selectedRole = role;
    auth.signInWithPopup(googleProvider).then((result) => {
        // The onAuthStateChanged will handle the rest
    }).catch((error) => {
        console.error("Login failed:", error);
        alert("Error al iniciar sesión: " + error.message);
    });
}

function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}
