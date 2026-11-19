# Despliegue en Cloud Run: variables de entorno

La imagen `odesweb` se construye con `cloudbuild.yaml` (Dockerfile de la raíz) y corre en
Cloud Run por el puerto **9003**.
una sola vez en la consola de Google Cloud, en *Cloud Run → servicio → Editar e
implementar nueva revisión → Variables y secretos*.

## Las que hay que poner

Las marcadas como **secreto** conviene guardarlas en Secret Manager y referenciarlas desde Cloud Run

### Base del sitio: planeacionbd (repositorio, PAI, cuentas de los tableros)

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
