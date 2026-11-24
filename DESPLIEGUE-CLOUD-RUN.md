# Despliegue en Cloud Run: variables de entorno

La imagen `odesweb` se construye con `cloudbuild.yaml` (Dockerfile de la raíz) y corre en
Cloud Run por el puerto **9003**.
una sola vez en la consola de Google Cloud, en *Cloud Run → servicio → Editar e
implementar nueva revisión → Variables y secretos*.

## Las que hay que poner

Las marcadas como **secreto** conviene guardarlas en Secret Manager y referenciarlas desde Cloud Run

### Base del sitio: planeacionbd (repositorio, PAI, CRM, cuentas de los tableros)

| Variable | Valor |
| --- | --- |
| `REPOSITORIO_MYSQL_HOST` | `35.202.252.42` |
| `REPOSITORIO_MYSQL_PORT` | `3306` |
| `REPOSITORIO_MYSQL_DATABASE` | `planeacionbd` |
| `REPOSITORIO_MYSQL_USER` | `sapiencia_web` |
| `REPOSITORIO_MYSQL_PASSWORD` | **secreto** |
| `REPOSITORIO_MYSQL_SSL` | `requerido` |
| `REPOSITORIO_MYSQL_CONEXIONES` | `3` |

### Ventanilla de consulta de fondos: bdconvocatoriasfondos (solo lectura)

| Variable | Valor |
| --- | --- |
| `FONDOS_CONSULTA_ORIGEN` | `sapiencia` |
| `SAPIENCIA_LECTURA_FONDOS_HOST` | `34.70.133.119` |
| `SAPIENCIA_LECTURA_PORT` | `3306` |
| `SAPIENCIA_LECTURA_FONDOS_DATABASE` | `analitica_fondos` |
| `SAPIENCIA_LECTURA_USER` | `odesweb` (usuario de solo lectura) |
| `SAPIENCIA_LECTURA_PASSWORD` | **secreto** |
| `SAPIENCIA_LECTURA_SSL` | `requerido` |

### Asistente ODES

| Variable | Valor |
| --- | --- |
| `ANTHROPIC_API_KEY` | **secreto**: la clave de producción de la API de Claude. Sin ella el chat solo busca documentos, sin IA. |
| `ODES_URL_DOCUMENTO` | `/api/repositorio/documentos/{id}/ver` |

### CRM (`/crm`): correo de los avisos

Sin `CRM_CORREO_USUARIO` y `CRM_CORREO_CLAVE` el CRM funciona igual, pero no envía correos (los
avisos quedan «sin configurar» en la bandeja del líder, que los puede reintentar después).

| Variable | Valor |
| --- | --- |
| `CRM_CORREO_USUARIO` | La cuenta que envía los avisos; también es el remitente. |
| `CRM_CORREO_CLAVE` | **secreto**: la contraseña de aplicación de esa cuenta (se le quitan los espacios). |
| `CRM_CORREO_HOST` | Solo con un dominio que no sea gmail.com ni de Microsoft. Por defecto `smtp.gmail.com` para gmail.com y `smtp.office365.com` para outlook.com, hotmail.com, live.com y onmicrosoft.com. |
| `CRM_CORREO_PUERTO` | Opcional: por defecto `465` con smtp.gmail.com; si no, `587`. |
| `CRM_CORREO_SEGURO` | Opcional: `si` (TLS desde el inicio) o `no` (STARTTLS). Por defecto `si` con el 465. |
| `CRM_CORREO_NOMBRE` | Opcional: nombre visible del remitente. Por defecto «Planeación Sapiencia». |
| `CRM_CORREO_MODO` | Opcional: `smtp` (por defecto si hay usuario y clave) o `desactivado`. El modo `archivo` no sirve en Cloud Run (el disco se borra). |
| `CRM_CORREO_DIRECTORIO` | No se pone en Cloud Run: es la carpeta de los `.eml` del modo `archivo`. |
| `CRM_URL_SITIO` | `https://odes-web-327402776385.us-central1.run.app` (base de los enlaces de los correos; opcional). |

Microsoft 365 está retirando la autenticación básica de SMTP: con una cuenta @sapiencia.gov.co puede
no funcionar. Con Gmail y una contraseña de aplicación sí.

**Orden para la primera versión con el CRM** (el servidor exige el esquema 10; si la imagen nueva
llega antes que la migración, toda la API de la base responde 503 hasta migrar):

1. Migrar planeacionbd a la versión 10 desde un equipo con acceso
   (`npm run repositorio:migrar -- --usuario <cuenta_admin>`, o a mano con `010-crm.sql`) y dar a
   `sapiencia_web` el GRANT de las 10 tablas `crm_*` (la lista está en
   `apps/server/db/repositorio/LEEME.md`, «CRM (versión 10)»).
2. Cargar el equipo y la clave del líder con el SQL que imprimen las CLI, y correrlo en planeacionbd:
   `npm run crm:cargar-equipo -- --archivo apps/server/datos/crm/equipo.json --solo-sql` y
   `npm run crm:clave-lider -- --solo-sql` (pide la contraseña; el SQL lleva solo su hash). El JSON
   del equipo no se sube al repositorio.
3. Poner las variables `CRM_*` de arriba en Cloud Run (`CRM_CORREO_CLAVE` desde Secret Manager).
4. Después, el push (Cloud Build construye y despliega la imagen).

### Detrás de Cloud Run

| Variable | Valor | Para qué |
| --- | --- | --- |
| `TRUST_PROXY` | `1` | Cloud Run pone un proxy delante; así el servidor ve la IP real de quien consulta (los límites del chat y la bitácora de la ventanilla van por IP). Si además se pone un balanceador de carga externo delante, usar `2`. |
| `CSP_FRAME_ANCESTORS` | `'self' https://www.sapiencia.gov.co` | Solo si el sitio se va a mostrar dentro del WordPress de Sapiencia (iframe). Sin ella, solo el mismo sitio puede incrustarlo. |

En la consola, además, marcar **«Permitir invocaciones sin autenticar»**: el sitio es público
(los tableros privados y la administración piden su propio ingreso).

**No poner** `REPOSITORIO_COOKIE_SEGURA=false`: es solo para probar la imagen en un equipo
por `http://localhost`.

## El índice del asistente ODES

`apps/server/datos/odes/indice.sqlite` va en git y entra en la imagen. En Cloud Run no se
puede reindexar desde la administración (no hay herramientas de OCR y el disco se borra en
cada reinicio), por eso la imagen trae `ODES_REINDEXAR=desactivado`. Cuando cambien los
documentos del repositorio:

1. En un equipo con acceso a planeacionbd: `npm --prefix apps/server run odes:indexar`.
2. Commit de `apps/server/datos/odes/indice.sqlite`.
3. Volver a correr Cloud Build.

## Probar la imagen en un equipo

```bash
docker build -t odesweb .
docker run --rm -p 9003:9003 --env-file apps/server/.env.docker odesweb
```

`apps/server/.env.docker` (ignorado por git) lleva las mismas variables de arriba, con sus
claves, más `REPOSITORIO_COOKIE_SEGURA=false`.
