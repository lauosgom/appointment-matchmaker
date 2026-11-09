# Alcance funcional del MVP

## Herramienta de asignación de citas con especialistas --- Teléfono de la Esperanza

**Versión:** Borrador consolidado\
**Propósito:** Definir la primera versión funcional de una herramienta
para consultar disponibilidad y gestionar asignaciones y citas con
especialistas, sin integración con Llamatel.

------------------------------------------------------------------------

## 1. Objetivo y alcance

La herramienta permitirá que los orientadores consulten espacios
disponibles de los especialistas y gestionen asignaciones que pueden
quedar pendientes de confirmación. Una asignación podrá confirmarse
definitivamente por el orientador que la inició o por un administrador.

La primera versión se desarrollará **sin integración con Llamatel y sin
registro de la llamada de crisis**. No se almacenará el motivo de la
crisis.

### Incluido en el MVP

-   Inicio de sesión por usuario y contraseña.
-   Perfiles de administrador, orientador y especialista.
-   Administración de usuarios, especialistas, departamentos, áreas de
    intervención y disponibilidad.
-   Búsqueda de espacios por especialista, departamento o área de
    intervención.
-   Asignaciones pendientes de confirmación.
-   Confirmación definitiva y generación del código de cita.
-   Descarte de asignaciones pendientes.
-   Cancelación administrativa de citas confirmadas.
-   Consulta de citas y asignaciones según el perfil.
-   Historial operativo de citas canceladas y asignaciones descartadas.
-   Recuperación de contraseña por correo electrónico.
-   Mensajes claros para informar errores y orientar al usuario.

### Fuera del MVP

-   Integración con Llamatel.
-   Registro o transcripción de llamadas de crisis.
-   Registro del motivo de crisis.
-   Envío de correos automáticos para confirmar citas.
-   Calendario visual; las consultas se presentarán inicialmente en
    listas.
-   Funcionalidades para que el especialista modifique citas o gestione
    su disponibilidad.
-   Función para marcar una cita como realizada.
-   Historial de auditoría detallado de accesos y operaciones.
-   Definición detallada de los requisitos de seguridad y protección de
    datos, que se abordará en una fase posterior.

------------------------------------------------------------------------

## 2. Perfiles y permisos

### 2.1 Administrador

Puede:

-   Crear, modificar y desactivar cuentas de usuario.
-   Asignar perfiles y establecer una contraseña inicial.
-   Administrar especialistas, departamentos y áreas de intervención.
-   Administrar los espacios de disponibilidad.
-   Configurar la duración global de las citas.
-   Configurar las dos letras correspondientes a cada año para los
    códigos de cita.
-   Consultar asignaciones y citas, con filtros por especialista y
    estado.
-   Confirmar asignaciones pendientes.
-   Descartar asignaciones pendientes, indicando el motivo.
-   Cancelar citas confirmadas, indicando el motivo.
-   Iniciar una nueva asignación a partir de una cita cancelada, con
    nombre y celular precargados cuando existan.

### 2.2 Orientador

Puede:

-   Buscar disponibilidad por especialista, departamento o área de
    intervención.
-   Consultar próximos horarios o buscar una fecha concreta.
-   Iniciar una asignación.
-   Revisar los datos antes de guardar la asignación.
-   Confirmar definitivamente una asignación que inició.
-   Descartar una asignación pendiente que inició, indicando el motivo.
-   Consultar todas las citas confirmadas, con filtro por especialista.
-   Consultar las asignaciones que inició, cualquiera que sea su estado,
    ordenadas de la más reciente a la más antigua.
-   Solicitar la corrección de una cita confirmada al administrador.

No puede cancelar directamente una cita confirmada.

### 2.3 Especialista

Puede:

-   Consultar sus propias citas confirmadas.
-   Ver las citas próximas y las del día actual.
-   Consultar el historial de citas con fecha pasada.

No puede modificar ni cancelar citas, confirmar o descartar
asignaciones, ni gestionar sus horarios de disponibilidad.

------------------------------------------------------------------------

## 3. Inicio de sesión y cuentas

-   El acceso será mediante **nombre de usuario y contraseña**.
-   El administrador creará las cuentas, asignará el perfil y
    establecerá la contraseña inicial.
-   El administrador podrá desactivar una cuenta. Una cuenta desactivada
    no podrá ingresar al sistema, pero las operaciones históricas
    conservarán la referencia al usuario que las realizó.
-   Si se realizan varios intentos fallidos de inicio de sesión, el
    sistema bloqueará temporalmente el acceso durante **5 minutos**.
-   Se incluirá recuperación de contraseña mediante un enlace enviado al
    correo electrónico del usuario.
-   Los correos automáticos se utilizarán únicamente para recuperar
    contraseñas; no se enviarán confirmaciones de citas por correo.

------------------------------------------------------------------------

## 4. Catálogos

### 4.1 Especialistas

El administrador podrá crear, modificar y desactivar especialistas. Cada
registro incluirá:

-   Código manual y único.
-   Nombre completo.
-   Uno o varios departamentos.
-   Una o varias áreas de intervención.
-   Estado activo o inactivo.

El sistema impedirá códigos duplicados. Los especialistas no se
eliminarán físicamente: se desactivarán para conservar el historial.

Al desactivar un especialista, el sistema advertirá si tiene citas
confirmadas pendientes. Una vez desactivado, no aparecerá en nuevas
búsquedas. La información histórica se conservará.

### 4.2 Departamentos y áreas de intervención

Se administrarán en formularios separados y serán catálogos
independientes. Cada elemento tendrá:

-   Código único.
-   Nombre.
-   Estado activo o inactivo.

Un área de intervención no tiene que pertenecer obligatoriamente a un
departamento. Un especialista puede estar asociado con varios
departamentos y varias áreas.

El sistema impedirá códigos duplicados. Los códigos podrán cambiar sin
perder las asociaciones, porque las relaciones se conservarán mediante
identificadores internos estables.

No se eliminarán físicamente departamentos ni áreas. Al desactivar una
categoría, el sistema advertirá si hay especialistas asociados o citas
pendientes. Si se confirma la desactivación, se conservarán las citas
existentes y la categoría dejará de estar disponible para nuevas
asignaciones.

------------------------------------------------------------------------

## 5. Gestión de disponibilidad

-   El administrador cargará manualmente los espacios mediante un
    formulario en pantalla.
-   Podrá seleccionar un especialista y agregar varias filas de fecha y
    hora en una misma operación.
-   Cada espacio se registrará individualmente; no habrá generación
    automática de horarios por rangos ni carga desde Excel.
-   Cada espacio tendrá fecha y hora de inicio y utilizará una duración
    global configurable por el administrador.
-   El sistema impedirá espacios duplicados y solapamientos para un
    mismo especialista.
-   El administrador podrá desactivar espacios que no estén reservados.
    No se borrarán: quedarán inactivos.
-   Los espacios inactivos podrán reactivarse si no tienen una cita
    asignada y no generan conflictos.
-   Los espacios ocupados o desactivados no se mostrarán como
    disponibles al orientador.
-   Si cambia la duración global, las citas confirmadas y las
    asignaciones pendientes conservarán su duración original. El cambio
    se aplicará a los espacios disponibles que no presenten conflictos.
    El sistema advertirá cuáles requieren revisión manual.

Los espacios son compartidos entre las categorías del especialista. Si
un horario se reserva desde una búsqueda por departamento o por área,
dejará de estar disponible en todas las categorías asociadas a ese
especialista.

------------------------------------------------------------------------

## 6. Búsqueda y selección de horarios

El orientador podrá buscar por:

1.  Especialista.
2.  Departamento.
3.  Área de intervención.

Cuando la búsqueda sea por departamento o área:

-   Se mostrarán los especialistas asociados y su próxima
    disponibilidad.
-   Los resultados se ordenarán por fecha y hora más próximas.
-   Si dos o más especialistas tienen disponibilidad en la misma fecha y
    hora, se mostrarán todos para que el orientador elija.
-   El orientador podrá consultar los próximos horarios o buscar una
    fecha concreta.
-   Al mostrar los horarios disponibles, se presentarán la fecha y la
    hora; el especialista ya se habrá identificado en el paso anterior.

------------------------------------------------------------------------

## 7. Flujo de asignación y confirmación

1.  El orientador busca y selecciona un espacio disponible.
2.  Ingresa el nombre y/o el número de celular de la persona. Debe
    diligenciar al menos uno; puede ingresar ambos.
3.  El sistema muestra una pantalla de revisión con el nombre/celular
    disponible, el especialista, la fecha y la hora.
4.  Al guardar, se crea una asignación con estado **Pendiente de
    confirmación**.
5.  La asignación pendiente queda visible para el administrador y
    bloquea temporalmente el horario.
6.  No habrá vencimiento automático de las asignaciones pendientes.
7.  El orientador que inició la asignación o un administrador podrá
    confirmarla definitivamente.
8.  Al confirmar, el mismo registro pasa a **Confirmada**, se genera el
    código de cita y el horario queda ocupado.
9.  El sistema conservará quién inició la asignación y quién la
    confirmó.
10. Si el orientador que inició la asignación o el administrador la
    descarta, deberá indicar el motivo. Se conservará el registro como
    **Descartada**, junto con el motivo, el usuario y la fecha/hora de
    la operación. No se generará código y se liberará el horario.

Las asignaciones pendientes se mostrarán al administrador de la más
antigua a la más reciente. El orientador podrá consultar las
asignaciones que inició, ordenadas de la más reciente a la más antigua.

------------------------------------------------------------------------

## 8. Códigos de cita

-   El código se asignará únicamente cuando la asignación se confirme
    definitivamente.
-   El código incluirá dos letras configuradas para el año y un
    consecutivo único global.
-   El consecutivo será global, no se reiniciará por especialista,
    departamento ni área.
-   El administrador configurará manualmente las letras de cada año; por
    ejemplo, **2026 = AK**.
-   El sistema aplicará las letras configuradas para el año en que se
    confirma la cita.
-   Si se cambian las letras de un año, los códigos históricos ya
    generados no cambiarán.
-   Los códigos nunca se reutilizarán, incluso si una cita se cancela.

------------------------------------------------------------------------

## 9. Consulta de citas y asignaciones

### Orientador

-   Puede consultar todas las citas confirmadas y filtrar por
    especialista.
-   Puede consultar todas las asignaciones que inició, incluidas las
    pendientes, confirmadas y descartadas.
-   Sus asignaciones se ordenarán de la más reciente a la más antigua.
-   No puede cancelar una cita confirmada; debe solicitar la corrección
    al administrador.

### Administrador

-   Puede consultar todas las asignaciones y citas, con filtros por
    especialista y estado.
-   Los listados principales se ordenarán por fecha más próxima, dejando
    las fechas pasadas al final.
-   Puede consultar las citas canceladas en el historial.
-   Las asignaciones pendientes se ordenarán de la más antigua a la más
    reciente.

### Especialista

-   Puede consultar únicamente sus propias citas confirmadas.
-   El listado presentará primero las citas próximas y las del día
    actual.
-   Podrá consultar el historial de citas con fecha pasada.

### Datos mostrados

Los listados de citas incluirán, según corresponda:

-   Código de cita.
-   Nombre y/o celular de la persona.
-   Especialista.
-   Fecha y hora.
-   Estado.
-   Orientador que inició la asignación.
-   Usuario que confirmó o canceló, cuando aplique.

La vista inicial será una lista básica, no un calendario visual.

------------------------------------------------------------------------

## 10. Cancelación y corrección de citas

-   Solo el administrador podrá cancelar una cita confirmada.
-   La cancelación registrará estado, fecha/hora, usuario y motivo.
-   No se permitirá cancelar citas cuya fecha y hora ya hayan pasado.
-   Para corregir una cita, el administrador cancelará la cita
    incorrecta y creará una nueva asignación.
-   Después de cancelar, el sistema ofrecerá iniciar una nueva
    asignación para la misma persona y precargará el nombre y el celular
    que estuvieran registrados. El especialista y el horario deberán
    seleccionarse nuevamente.
-   El código de la cita cancelada no se reutilizará.
-   El horario cancelado se liberará automáticamente si sigue vigente y
    no está desactivado.

------------------------------------------------------------------------

## 11. Estados

Los estados previstos son:

-   **Pendiente de confirmación:** asignación guardada que aún no se ha
    confirmado definitivamente.
-   **Confirmada:** asignación confirmada y con código de cita.
-   **Fecha pasada:** cita confirmada cuya fecha y hora ya
    transcurrieron.
-   **Cancelada:** cita confirmada que el administrador canceló.
-   **Descartada:** asignación pendiente que el orientador iniciador o
    el administrador descartó.

Cuando la fecha y hora de una cita confirmada hayan pasado, el sistema
la mostrará como **Fecha pasada**. Este estado no implica que la persona
haya asistido ni que la cita se haya realizado. En el MVP no habrá una
función para marcar citas como realizadas.

------------------------------------------------------------------------

## 12. Presentación y mensajes

-   La pantalla inicial será un menú sencillo con las opciones
    disponibles según el perfil.
-   Las fechas se mostrarán en formato colombiano: `DD/MM/AAAA`.
-   Las horas se mostrarán en formato de 24 horas: `HH:MM`.
-   El sistema utilizará la hora de Colombia para registrar y mostrar
    las citas.
-   Ante un error, mostrará un mensaje claro que explique qué ocurrió y
    cómo puede continuar el usuario.

------------------------------------------------------------------------

## 13. Decisiones pendientes o por precisar

Este documento consolida las decisiones tomadas hasta ahora. Antes de
considerarlo definitivo, conviene revisar:

1.  **Política de seguridad y privacidad:** quedó aplazada para una fase
    posterior. Aunque su diseño detallado esté fuera de este alcance,
    deberá definirse antes de poner el sistema en producción.
2.  **Número de intentos fallidos:** está definido el bloqueo de 5
    minutos, pero falta establecer cuántos intentos lo activan.
3.  **Recuperación de contraseña:** está definido el envío de un enlace
    al correo; falta concretar su vigencia y el procedimiento de uso.
4.  **Cambios en la duración global:** falta definir cómo se
    identificarán y resolverán los espacios que requieran revisión
    manual.
5.  **Zona horaria y fechas pasadas:** está definido el uso de la hora
    de Colombia; deberá concretarse el momento exacto en que el sistema
    cambia una cita a «Fecha pasada».
6.  **Descarte y cancelación:** se requiere definir si el motivo será
    texto libre obligatorio o una lista de motivos.
7.  **Diseño técnico e implementación:** no se ha elegido tecnología,
    arquitectura, alojamiento ni estrategia de copias de seguridad.

------------------------------------------------------------------------

## 14. Criterio general de la primera versión

El MVP prioriza una operación sencilla y controlada: el orientador
identifica disponibilidad y crea asignaciones; el orientador que las
inició o el administrador puede confirmarlas; el administrador mantiene
los catálogos, la disponibilidad y las cancelaciones; y el especialista
consulta únicamente su propia agenda.

Las integraciones, automatizaciones y funciones operativas adicionales
se evaluarán en fases posteriores.
