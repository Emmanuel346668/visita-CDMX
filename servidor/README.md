# VISITA CDMX — servidor del plan de amigos

Estado: preparado y probado localmente. Todavía necesita publicarse en tu cuenta de Cloudflare.

Este paquete incluye la página y el guardado compartido. Cada grupo tiene una invitación aleatoria de 256 bits. Quien conserve el enlace puede leer y editar ese grupo, sin crear cuentas de visitante ni iniciar sesión con ChatGPT. El nombre del editor es un alias, no una identidad verificada. Comparte las invitaciones solo con tus amigos.

## Publicar desde GitHub y Cloudflare

1. Crea una cuenta en https://dash.cloudflare.com/sign-up y verifica tu correo. Usa Workers Free.
2. En tu repositorio `Emmanuel346668/visita-CDMX`, selecciona **Add file → Upload files**. Arrastra la carpeta `servidor` de este ZIP y guarda con **Commit changes**. Conserva la carpeta `docs` que ya existe.
3. En Cloudflare, abre **Workers & Pages → Create application** y elige la opción para importar un repositorio de GitHub. Autoriza la aplicación oficial de Cloudflare únicamente para `visita-CDMX` y selecciona ese repositorio.
4. Configura el proyecto así:
   - Nombre del Worker: `visita-cdmx-grupo`
   - Rama: `main`
   - Directorio raíz: `servidor`
   - Comando de compilación: vacío
   - Comando de publicación: `npx wrangler deploy`
5. Publica. Wrangler crea automáticamente los dos Durable Objects con almacenamiento SQLite declarados en `wrangler.jsonc`. No necesitas contratar un dominio, contratar un servidor permanente ni crear una base de datos manualmente.
6. Conserva la dirección HTTPS `*.workers.dev` que devuelva Cloudflare. Abre la página allí, entra a **Plan del grupo**, escribe tu nombre y crea el grupo con una copia de **Mi plan**.
7. Pulsa **Copiar invitación**. Ábrela en otro navegador o dispositivo, cambia una parada y verifica que el primer dispositivo la reciba. El intervalo de actualización es de 5 segundos mientras la pestaña está visible.

Documentación oficial: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Conservar el enlace actual de GitHub Pages

Después de publicar, prepara una copia de `public/group.js` anteponiendo esta línea, con la dirección REAL devuelta por Cloudflare:

```js
window.CDMX_GROUP_SERVER = "https://DIRECCION-REAL-DEL-SERVIDOR";
```

Sustituye únicamente `docs/group.js` en GitHub por esa copia. El servidor admite solicitudes de `https://emmanuel346668.github.io` mediante CORS y las invitaciones se mantienen en la dirección de GitHub Pages. De esta forma, **Mi plan** conserva el almacenamiento local que ya existe en esa página y **Plan del grupo** utiliza el servidor nuevo.

No publiques el marcador de ejemplo como si fuera una dirección real. También puedes usar directamente la página alojada en Cloudflare; en ese caso, el almacenamiento personal pertenece a esa nueva dirección. Usa **Guardar viaje** y **Cargar copia** para trasladar un plan personal entre las dos direcciones.

## Guardado y acceso

- Los planes se guardan en Durable Objects con SQLite, uno por grupo; no en memoria temporal.
- Las transacciones y el número de revisión impiden que dos editores sobrescriban silenciosamente los cambios del otro. El borrador del segundo editor queda protegido en su navegador para compararlo.
- El servidor conserva solamente el hash de la invitación. Las respuestas normales no revelan la invitación ni su hash. El enlace original contiene la llave en el fragmento `#`, y el navegador la envía al servidor en el encabezado Authorization.
- Cualquier persona con la invitación puede editar. No hay recuperación por correo ni revocación individual. Si se filtra una invitación, crea otro grupo con una copia del plan y comparte el enlace nuevo con las personas correctas.
- Se limitan las altas a 5 grupos por IP al día y 100 grupos diarios en toda la aplicación. Ese límite no bloquea el uso de grupos ya creados.
- Las solicitudes de otros orígenes se rechazan; las solicitudes válidas siempre deben presentar también la invitación del grupo.

## Plan gratuito y comprobación

Workers Free permite estos Durable Objects con SQLite. Sus límites publicados incluyen 100.000 solicitudes diarias a Durable Objects y 5 GB totales de almacenamiento SQLite. Si se supera un límite del plan gratuito, las operaciones correspondientes fallan hasta que se restablezca la cuota; no se activa un plan de pago mediante este paquete.

Fuente: https://developers.cloudflare.com/durable-objects/platform/pricing/

Se probaron en el motor local de Cloudflare los archivos de la página, CORS para GitHub, acceso mediante invitación, rechazo de terceros, edición de dos amigos, conflictos simultáneos, persistencia tras reiniciar y límites de creación. La publicación real todavía está pendiente. La comprobación adicional de empaquetado con Wrangler en este Windows quedó limitada por los permisos de lectura del compilador; la configuración sí fue leída por Wrangler y el código se ejecutó en el simulador real de Workers.

Hecho por Emmanuel de la Cruz Rdz y CHATSITO.
