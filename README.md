# MecanoClass - Mecanografía para el Aula

Una plataforma web moderna para practicar mecanografía en clase, con modo competición en vivo y seguimiento de progreso.

## Características

- 🎓 **Perfiles Docente y Alumno**: Gestión de clases y roles diferenciados.
- 🚀 **Competición en Vivo**: Modo estilo "Kahoot" donde los alumnos compiten en tiempo real proyectados en la pizarra.
- 📊 **Seguimiento**: Historial de ejercicios, PPM (Pulsaciones por minuto) y precisión.
- 🎨 **Diseño Premium**: Interfaz moderna con modo oscuro, glassmorphism y avatares personalizados (DiceBear).
- 🔗 **Fácil Acceso**: Login con Google y unión a clases mediante PIN.

## Configuración e Instalación

1. **Clonar el repositorio** o descargar los archivos.
2. **Configurar Firebase**:
   - Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
   - Habilita **Authentication** con proveedor de Google.
   - Habilita **Firestore Database**.
   - Copia la configuración de tu proyecto (SDK Setup).
   - Abre `js/firebase-config.js` y pega tus claves API.

3. **Desplegar**:
   - Sube el contenido a **GitHub Pages** o cualquier hosting estático.
   - Asegúrate de añadir la URL de tu dominio (ej. `tu-usuario.github.io`) en los "Dominios autorizados" de Firebase Authentication.

## Reglas de Firestore (Seguridad)

Para empezar, puedes usar reglas de modo prueba, pero para producción se recomienda:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Tecnologías

- HTML5, CSS3 (Bootstrap 5 + Custom)
- JavaScript (Vanilla)
- Firebase (Auth, Firestore)
- API DiceBear (Avatares)

---
Creado para mejorar la velocidad mecanográfica de forma divertida.
# MecanoClass
