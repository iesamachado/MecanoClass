// Profile Controller

let currentUser = null;
let profile = null;

// DiceBear Avataaars Base URL
const DICEBEAR_BASE = "https://api.dicebear.com/9.x/avataaars/svg";

// Mapping of select IDs to DiceBear params
const PARAMS_MAP = {
    skinColor: 'skinColor',
    topType: 'top',
    hairColor: 'hairColor',
    facialHairType: 'facialHair',
    clotheType: 'clothing',
    clotheColor: 'clothesColor',
    clotheGraphicType: 'clothingGraphic',
    accessoriesType: 'accessories',
    accessoriesColor: 'accessoriesColor',
    eyeType: 'eyes',
    eyebrowType: 'eyebrows',
    mouthType: 'mouth'
};

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        profile = await getUserProfile(user.uid);
        if (profile) {
            initUI(profile);
        } else {
            // Should not happen
            alert("Perfil no encontrado.");
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

function initUI(profile) {
    document.getElementById('displayNameInput').value = profile.displayName;

    // Parse existing Avatar URL to set selects if possible?
    // It's hard to reverse engineer the URL easily without a parser.
    // Simpler approach: We start with defaults or randomized, or we try to extract params.
    // If the URL is from dicebear.com... let's try.

    // URL format: .../svg?seed=...&param=val
    if (profile.photoURL && profile.photoURL.includes('dicebear.com')) {
        try {
            const url = new URL(profile.photoURL);
            const params = new URLSearchParams(url.search);

            for (const [selectId, paramName] of Object.entries(PARAMS_MAP)) {
                if (params.has(paramName)) {
                    // Because params can be arrays or comma separated, we take the first.
                    // But our UI uses single values.
                    // Note: DiceBear v9 might use top vs topType. I used v9 syntax in HTML values? No, I used specific keywords.
                    // Let's check API. v9 uses 'top', 'accessories' etc.
                    // My PARAMS_MAP seems aligned with v9.

                    const val = params.get(paramName);
                    // Set select value
                    const select = document.getElementById(selectId);
                    if (select) select.value = val;
                }
            }
        } catch (e) {
            console.warn("Could not parse avatar URL", e);
        }
    }

    // Trigger initial render
    updateAvatar();
}

function updateAvatar() {
    const seed = currentUser ? currentUser.uid : 'custom';
    const params = new URLSearchParams();

    params.append('seed', seed);
    params.append('backgroundColor', 'b6e3f4'); // match UI bg

    for (const [selectId, paramName] of Object.entries(PARAMS_MAP)) {
        const select = document.getElementById(selectId);
        if (select && select.value && select.value !== 'Blank') {
            if (paramName === 'top' && select.value === 'noHair') {
                // Avataaars 9.x handles 'no hair' by probability 0 or omitting top?
                // Actually the schema has 'topProbability'.
                // Setting topProbability=0 ensures no top is rendered.
                params.append('topProbability', '0');
            } else {
                // Send value as is (DiceBear supports PascalCase)
                params.append(paramName, select.value);
                // Ensure probabilities are 100 if we set a value, as defaults are low (e.g. 10%)
                if (paramName === 'top') {
                    params.append('topProbability', '100');
                }
                if (paramName === 'facialHair') {
                    params.append('facialHairProbability', '100');
                }
                if (paramName === 'hairColor') {
                    params.append('facialHairColor', select.value);
                }
                if (paramName === 'accessories') {
                    params.append('accessoriesProbability', '100');
                }
            }
        }
    }

    const newUrl = `${DICEBEAR_BASE}?${params.toString()}`;
    console.log("Generated Avatar URL:", newUrl); // Debugging

    const img = document.getElementById('avatarBig');
    img.src = newUrl;

    img.onerror = function () {
        console.warn("Avatar failed to load. Retrying with minimal params...");
        // Fallback to minimal URL to see if it's a param issue
        img.src = `${DICEBEAR_BASE}?seed=${seed}`;
        img.onerror = null; // Prevent infinite loop
    };

    // Store current URL in a global var or just grab it on save
    profile.pendingPhotoURL = newUrl;
}

function randomizeAvatar() {
    // Randomize all selects
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        const options = select.options;
        const randomIndex = Math.floor(Math.random() * options.length);
        select.selectedIndex = randomIndex;
    });
    updateAvatar();
}

async function saveProfile() {
    const name = document.getElementById('displayNameInput').value.trim();
    if (!name) return alert("El nombre no puede estar vacío.");

    const btn = document.querySelector('button[onclick="saveProfile()"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Guardando...';

    try {
        const photoURL = document.getElementById('avatarBig').src;
        await updateUserProfile(currentUser.uid, name, photoURL);

        // Update profile obj
        profile.displayName = name;
        profile.photoURL = photoURL;

        btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>¡Guardado!';
        btn.classList.replace('btn-premium', 'btn-success');

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.replace('btn-success', 'btn-premium');
        }, 2000);

    } catch (e) {
        console.error("Error saving profile", e);
        alert("Error al guardar cambios.");
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
