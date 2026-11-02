# Preguntas frecuentes

## ¿Por qué el patrón Result en lugar de excepciones?

Los documentos fiscales y las llamadas de red tienen modos de falla predecibles
(e-CF rechazado, timeout, certificado vencido). Hacerlos explícitos en el
sistema de tipos (`Result<T, E>`) obliga a quien invoca la API a manejarlos y
evita fallos silenciosos.

## ¿Por qué solo del lado del servidor?

Los SDKs cargan claves privadas `.p12` y transmiten credenciales. Enviarlos a un
navegador expondría esos secretos.

## ¿El SDK de TypeScript funciona en Node y Bun?

Sí. Apunta a Node.js 20+ y Bun 1+, usa `fetch` nativo y distribuye ESM, CJS y
declaraciones de tipos.

## ¿Qué versión de Python se requiere?

Python 3.11+. El cliente HTTP es [`httpx2`](https://pypi.org/project/httpx2/),
que dejó de soportar 3.9/3.10.

## ¿Cómo verifico una firma?

Usa una herramienta independiente:

```bash
xmlsec1 --verify --insecure signed.xml
```

Luego envíala al entorno de certificación de la DGII.

## ¿Por qué la primera publicación en npm es manual?

La publicación de confianza (trusted publishing) de npm requiere que el paquete
ya exista, así que la primera versión se publica localmente. Después de eso,
configura el trusted publisher y las publicaciones siguientes salen desde GitHub
Actions vía OIDC.

## ¿Cómo roto el certificado?

El certificado es infraestructura de producción. Monitorea su vencimiento (el SDK
expone `getCertificateInfo` / `getCertificateInfoFromBase64`) y rótalo antes de
que expire — alerta a los 60/30/7 días. Nunca subas el `.p12` ni su contraseña al
repositorio.

## ¿Cómo reporto un problema de seguridad?

Consulta
[SECURITY.md](https://github.com/deuriib/dgii-ecf/blob/main/SECURITY.md). No
abras un issue público.
