# Jumpy Fish Web

## Objetivo
Quiero hacer una aplicación web con html, javascript, css y con canvas para móvil y tablet. Es un juego web.
El nombre de la aplicación es ‘Jumpy fish’.
Las imágenes las tengo en el directorio images.
Los sonidos están en el directorio sounds.

## Trabajo de agente
El agente tiene permisos para ejecutar cualquier acción que necesite, no necesita confirmar con el programador.
No hace falta preguntar para leer o escribir ficheros. Tampoco para ejecutar comandos shell.

## Mecánica
La aplicación es en vertical tamaño teléfono.
Se maneja con el dedo.
 Es una aplicación con una mecánica igual a ‘flappy bird’, pero con un pez bajo el agua.
Se utiliza parallax para mover el fondo.
El protagonista es un pez que hay que hacerle saltar pulsando con el dedo en la pantalla.

## Splash screen
Al empezar el juego sale una splash screen con la imagen: splash.png
Esta pantalla se quita cuando se pulsa sobre ella.

## Fondo
En el directorio images tienes las imágenes de fondo para el parallax, se llaman game_background* . Cada dos minutos (con una aleatoriedad de 30 segundos máxima antes o después) cambia de fondo.

## Protagonista
El pez protagonista sólo se mueve hacia arriba (cuando se pulsa la pantalla salta) o hacia abajo (va cayendo si no se pulsa la pantalla). 
El pez está situado cerca del margen izquierdo de la pantalla.
Las imágenes del pez están en el directorio images y los ficheros se llaman Fish_00x con una numeración para hacer la animación.

## Obstáculos rocas
Las rocas hacen una función similar a los pipes en flappy bird.
Cuando el pez choca con una roca, se muere y cae abajo.
Al morir se muestra la imagen images/game_over.png sobre la pantalla del juego.
Al pulsar sobre la pantalla, comienza una nueva partida.
Las imágenes de las rocas están en el directorio images: Stone_1 es la roca de abajo y Stone_2 es la roca de arriba. Estas imágenes se colocan aleatoriamente en distintos puntos del movimiento, y además, se colocan aleatoriamente a distintas alturas, para que vaya variando el hueco entre ellas.


## Puntuación
Arriba a la derecha aparecen los puntos de la partida, que se van incrementando en uno cada vez que se pasa entre medias de una roca.
Arriba a la izquierda aparece el tiempo de juego en minutos:segundos que se va actualizando cada segundo.