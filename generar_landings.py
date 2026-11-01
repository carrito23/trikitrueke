#!/usr/bin/env python3
"""Genera las landings estáticas de Trikitrueke y el sitemap.

Uso:  python3 -I generar_landings.py RUTA_DEL_REPOSITORIO

Crea trueque.html, trueque-CATEGORIA.html y trueque-ZONA.html (todo en la
raíz, sin carpetas) y reescribe sitemap.xml. Para añadir una categoría o zona nueva, añádela a
CATEGORIAS o ZONAS y vuelve a ejecutarlo. Los id de categoría deben coincidir
con los de schema.sql.
"""
import html
import os
import sys

DOMINIO = "https://trikitrueke.es"
HOY = "2026-11-01"

CSP = ("default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'")

SEGURIDAD_COMUN = "No compartas datos bancarios. Nadie los necesita para un trueque."

PASOS = [
    ("Publica tu trueque", "Crea una cuenta gratuita, describe lo que das, añade una foto y di lo que te gustaría recibir."),
    ("Recibe propuestas", "Otros usuarios te proponen un cambio desde la web. Nadie ve tu correo ni tu teléfono, solo tu alias."),
    ("Quedad y cambiad", "Acordáis lugar y fecha en la conversación de la propuesta, os veis y cerráis el cambio. Sin dinero por medio."),
]

# ---------------------------------------------------------------------------
# CATEGORÍAS (los id coinciden con schema.sql)
# ---------------------------------------------------------------------------
CATEGORIAS = [
    dict(
        id="vehiculos", nombre="Vehículos",
        title="Trueque de coches y vehículos: cambia sin dinero | Trikitrueke",
        h1="Trueque de coches, motos y otros vehículos",
        desc="Cambia tu coche, moto o furgoneta por otro vehículo en Trikitrueke. Anuncios de trueque entre particulares en toda España, sin compraventa y gratis.",
        resumen="Coches, motos, furgonetas y caravanas.",
        intro="Cambiar un vehículo por otro tiene sentido más a menudo de lo que parece: la moto que casi no usas por un coche pequeño, la furgoneta por otra más grande cuando la familia crece, un clásico por otro clásico. En Trikitrueke el anuncio es siempre de cambio, no de venta. Dices lo que das, dices lo que buscas y esperas propuestas de otras personas de toda España.",
        ideas=[
            "Moto por coche pequeño, o al revés.",
            "Furgoneta o caravana por otro vehículo de ocio.",
            "Coche clásico por otro clásico o por una moto antigua.",
            "Ciclomotor, patinete eléctrico o bici eléctrica por otro modelo.",
            "Vehículo de trabajo ligero por uno de uso familiar.",
        ],
        prep=[
            "Indica marca, modelo, año de matriculación, kilómetros y tipo de combustible.",
            "Cuenta el estado real, incluidas las averías conocidas. Un anuncio sincero ahorra visitas en balde.",
            "Sube fotos del exterior, del interior y del cuadro de mandos.",
            "Di qué buscas con concreción (tipo de vehículo, años, uso) o marca «Escucho ofertas» si estás abierto a ideas.",
            "Pon la localidad, nunca tu dirección exacta.",
        ],
        seguridad=[
            "Comprobad la documentación de los dos vehículos: permiso de circulación, ficha técnica e ITV en vigor cuando corresponda.",
            "Verificad que quien cambia es el titular y que el vehículo no tiene cargas ni deudas pendientes. Se puede pedir un informe del vehículo a la DGT.",
            "Probad el vehículo acompañados, a la luz del día y en un lugar público.",
            "No entregues llaves ni documentación hasta tener claro cómo se hará el cambio de titularidad. Consulta en Tráfico o en una gestoría los trámites y los impuestos que puedan aplicarse.",
        ],
    ),
    dict(
        id="libros", nombre="Libros",
        title="Trueque de libros: cambia los que ya has leído | Trikitrueke",
        h1="Trueque de libros: cambia los que ya has leído por los que quieres leer",
        desc="Intercambia novelas, cómics, libros de texto y guías de viaje en Trikitrueke. Publica el libro que das, di cuál buscas y recibe propuestas, gratis.",
        resumen="Novela, cómic, libros de texto y guías.",
        intro="Casi todas las casas tienen una estantería con libros que ya no se van a releer. En Trikitrueke puedes darles salida cambiándolos por otros que sí te apetecen, sin pasar por una tienda de segunda mano ni poner un precio. Un libro por otro, un lote por una saga o una novela por un disco: tú decides qué buscas.",
        ideas=[
            "Novela por novela del mismo género o del mismo autor.",
            "Una saga completa por otra.",
            "Cómics, manga y novela gráfica.",
            "Libros infantiles y juveniles que ya se han quedado pequeños.",
            "Libros de texto, de oposiciones o de idiomas.",
            "Guías de viaje, libros de cocina o de bricolaje.",
        ],
        prep=[
            "Escribe título, autor y edición. El ISBN ayuda a que el otro sepa exactamente cuál es.",
            "Cuenta el estado: tapas, subrayados, hojas sueltas, olor a humedad.",
            "Haz una foto de la cubierta y otra del lomo.",
            "Si es un lote, di cuántos libros incluye y cuáles son.",
            "Di qué buscas: un autor, un género, un título concreto, o marca «Escucho ofertas».",
        ],
        seguridad=[
            "Quedad en un sitio público y con luz de día: una cafetería, una biblioteca o la plaza del pueblo.",
            "Revisad los libros antes de cerrar el cambio, sobre todo si es un lote.",
            "Si cambias libros de texto, comprueba que la edición es la que necesitas: suelen cambiar de un curso a otro.",
        ],
    ),
    dict(
        id="discos", nombre="Discos y música",
        title="Trueque de discos y música: vinilos y CD | Trikitrueke",
        h1="Trueque de discos, vinilos y música",
        desc="Cambia vinilos, CD, casetes y equipos de música en Trikitrueke. Anuncios de trueque entre particulares en toda España, sin compraventa.",
        resumen="Vinilos, CD, casetes y equipos de música.",
        intro="Los coleccionistas lo saben: a veces el disco que buscas lo tiene alguien que quiere otro distinto. En Trikitrueke publicas el vinilo, el CD o el casete que das y dices cuál te falta. Aquí nadie vende, así que los cambios van de disco a disco o de disco a lo que te interese.",
        ideas=[
            "Vinilos por vinilos: LP, EP y sencillos.",
            "CD y casetes de tu época por los de otra.",
            "Tocadiscos, platos, altavoces y equipos de música.",
            "Partituras, cancioneros y libros sobre música.",
            "Lotes de una misma banda, estilo o década.",
        ],
        prep=[
            "Escribe artista, título, año y, si lo conoces, la edición o el prensaje.",
            "Describe el estado del disco y el de la carátula por separado.",
            "Haz fotos con buena luz de la funda y del vinilo, para que se vean los arañazos.",
            "Si cambias un equipo, indica el modelo y si funciona.",
            "Di qué buscas o marca «Escucho ofertas».",
        ],
        seguridad=[
            "Ofrece escuchar el disco o probar el equipo en el momento del cambio.",
            "Si es un vinilo valioso, comprobad entre los dos la edición y el estado antes de cerrarlo.",
            "Quedad en un sitio público y con luz de día.",
        ],
    ),
    dict(
        id="ropa", nombre="Ropa",
        title="Trueque de ropa: cambia prendas que ya no usas | Trikitrueke",
        h1="Trueque de ropa y complementos",
        desc="Cambia ropa, calzado y complementos que ya no usas por otros que sí te gusten. Publica gratis en Trikitrueke y quedad en persona.",
        resumen="Ropa, calzado y complementos.",
        intro="El armario se llena de prendas que casi no se ponen y a la vez falta justo lo que necesitas para esta temporada. Cambiar ropa entre particulares alarga la vida de las prendas y no cuesta nada. En Trikitrueke publicas lo que das, dices tu talla y lo que buscas, y alguien te propone el cambio.",
        ideas=[
            "Abrigos y chaquetas por prendas de entretiempo.",
            "Ropa infantil por la talla siguiente.",
            "Calzado y botas de montaña.",
            "Bolsos, bufandas y complementos.",
            "Ropa de fiesta o de ceremonia.",
            "Ropa deportiva y técnica.",
        ],
        prep=[
            "Indica la talla y, si puedes, las medidas reales: la talla cambia de una marca a otra.",
            "Di la marca y el estado: usos, bolitas, desgaste.",
            "Haz fotos con luz natural, de la prenda entera y de algún detalle.",
            "Si ofreces varias prendas como lote, enuméralas.",
            "Escribe tu talla y el estilo que buscas, o marca «Escucho ofertas».",
        ],
        seguridad=[
            "Quedad en un sitio público y con luz de día.",
            "Si es posible, pruébate la prenda en el momento y revisa costuras y cremalleras.",
            "Airear o lavar la ropa antes de quedar es un detalle que se agradece.",
        ],
    ),
    dict(
        id="casas", nombre="Casas y escapadas",
        title="Intercambio de casas y escapadas de vacaciones | Trikitrueke",
        h1="Intercambio de casas y escapadas",
        desc="Cambia una semana en la costa por una en la montaña. Publica tu casa o apartamento de vacaciones en Trikitrueke y recibe propuestas de intercambio.",
        resumen="Casas, pisos y escapadas de vacaciones.",
        intro="Una semana en la costa por una semana en Galicia, la casa del pueblo por un piso en la ciudad durante las vacaciones, un fin de semana rural por una escapada de playa. El intercambio de casas permite viajar sin pagar alojamiento, y en Trikitrueke empieza con un anuncio sencillo: lo que ofreces, las fechas y lo que te gustaría recibir.",
        ideas=[
            "Semana en un apartamento de playa por una casa rural en el interior.",
            "Casa en el pueblo por un piso en una ciudad grande, o al revés.",
            "Escapada de fin de semana por otra de fechas parecidas.",
            "Casa o piso cerca de la nieve por otro cerca del mar.",
        ],
        prep=[
            "Indica las fechas disponibles y cuántas personas caben.",
            "Pon la zona y la localidad, nunca la dirección exacta.",
            "Cuenta qué incluye: habitaciones, baños, cocina, wifi, aparcamiento y si se admiten mascotas.",
            "Sube fotos reales y recientes de las estancias.",
            "Di qué buscas: zona, fechas y número de personas.",
        ],
        seguridad=[
            "Dejad por escrito las fechas, los gastos (luz, agua, limpieza) y qué pasa si alguien cancela.",
            "Comprobad que la otra persona puede ceder el uso de la vivienda: que es la propietaria o tiene permiso.",
            "Hablad antes del seguro del hogar y de las normas de la comunidad o de la urbanización.",
            "No pagues fianzas ni adelantos a alguien a quien no conoces, y no entregues llaves hasta tenerlo todo acordado.",
            "Si podéis, hablad por videollamada antes de cerrar el cambio.",
        ],
    ),
    dict(
        id="deporte", nombre="Deporte",
        title="Trueque de material deportivo y bicis | Trikitrueke",
        h1="Trueque de material deportivo, bicis y equipo de montaña",
        desc="Cambia bicis, esquís, tablas, raquetas y material de montaña. Publica gratis en Trikitrueke y quedad en persona para probarlo.",
        resumen="Bicis, montaña, nieve, agua y gimnasio.",
        intro="El material deportivo se queda corto o se queda parado: la bici que ya no encaja con cómo sales, las botas de montaña de una talla que no es, la tabla que lleva dos veranos en el trastero. Cambiarlo por algo que sí vas a usar es la salida más sencilla, y en Trikitrueke no hace falta poner precio.",
        ideas=[
            "Bici de montaña por una de carretera o de paseo.",
            "Esquís, snowboard y botas.",
            "Tabla de surf, paddle surf o kayak.",
            "Raquetas, palas y material de pádel o tenis.",
            "Pesas, bancos y material de gimnasio en casa.",
            "Equipo de senderismo, escalada o acampada.",
        ],
        prep=[
            "Indica el tipo y el modelo.",
            "Pon la talla o la medida que importe: cuadro, botas, neopreno, longitud de la tabla.",
            "Cuenta el año y el estado: desgaste, golpes, piezas cambiadas.",
            "Enumera los accesorios que se incluyen.",
            "Haz fotos del conjunto y de las partes que más sufren, como frenos, cantos o suela.",
            "Di qué buscas y en qué talla, o marca «Escucho ofertas».",
        ],
        seguridad=[
            "Probad el material antes de cerrar: una vuelta en bici, un ajuste de las botas.",
            "Revisad las piezas de seguridad: frenos, fijaciones, cuerdas, arneses.",
            "Si es material de escalada o de seguridad, comprueba su antigüedad y su estado.",
            "Quedad en un sitio público y con luz de día.",
        ],
    ),
    dict(
        id="tecnologia", nombre="Tecnología",
        title="Trueque de móviles, portátiles y consolas | Trikitrueke",
        h1="Trueque de tecnología: móviles, portátiles, consolas y cámaras",
        desc="Cambia móviles, portátiles, tablets, consolas y cámaras entre particulares. Publica gratis en Trikitrueke y quedad en persona para comprobarlos.",
        resumen="Móviles, portátiles, consolas y cámaras.",
        intro="Los cajones guardan móviles que ya no se usan, consolas de una generación pasada y cámaras que eran el capricho de hace unos años. Cambiar tecnología de segunda mano por otra que sí necesitas es una forma sencilla de renovar sin pagar. En Trikitrueke lo haces en persona, comprobando el aparato antes de cerrar.",
        ideas=[
            "Móvil por otro de otra gama o de otra marca.",
            "Portátil por una tablet o por un ordenador de sobremesa.",
            "Consola y videojuegos por otra consola o por juegos.",
            "Cámara y objetivos por otro equipo de fotografía.",
            "Auriculares, altavoces y relojes inteligentes.",
            "Monitores, teclados y otros periféricos.",
        ],
        prep=[
            "Escribe el modelo exacto y el año.",
            "Cuenta el estado de la batería y de la pantalla, y si ha tenido golpes.",
            "Enumera los accesorios: cargador, caja, cables y funda.",
            "Si tienes la factura o la garantía vigente, dilo.",
            "Restablece el aparato de fábrica y cierra tus cuentas antes de entregarlo.",
            "Di qué buscas o marca «Escucho ofertas».",
        ],
        seguridad=[
            "Comprobad que el aparato enciende y funciona, y que no está bloqueado ni vinculado a la cuenta de su anterior dueño.",
            "Pide ver la factura o un justificante de compra si lo tiene.",
            "Antes de entregar el tuyo, cierra sesión y restablécelo. No dejes accesos ni contraseñas.",
            "Quedad en un sitio público y con luz de día.",
        ],
    ),
    dict(
        id="hogar", nombre="Hogar",
        title="Trueque de muebles y artículos del hogar | Trikitrueke",
        h1="Trueque de muebles, decoración y artículos del hogar",
        desc="Cambia muebles, electrodomésticos pequeños, decoración y menaje. Publica gratis en Trikitrueke y acordad el cambio en persona.",
        resumen="Muebles, decoración, menaje y artículos de bebé.",
        intro="Una mudanza, una reforma o un cambio de gustos dejan por casa muebles y objetos que aún sirven. En vez de tirarlos o malvenderlos, puedes cambiarlos por algo que necesites más. En Trikitrueke publicas lo que das con sus medidas, dices qué buscas y quedáis para ver el artículo en persona.",
        ideas=[
            "Estanterías, mesas, sillas y sofás.",
            "Electrodomésticos pequeños: batidoras, cafeteras, microondas.",
            "Lámparas, espejos y decoración.",
            "Menaje, vajilla y ropa de cama.",
            "Artículos de bebé: cunas, tronas y carritos.",
            "Plantas y material de jardín.",
        ],
        prep=[
            "Pon las medidas exactas: son lo primero que conviene saber a quien lo ve.",
            "Indica el material, el estado y los desperfectos.",
            "Di si hay que desmontarlo o si hacen falta dos personas para moverlo.",
            "Haz fotos desde varios ángulos.",
            "Deja claro quién recoge qué y cómo.",
        ],
        seguridad=[
            "Comprobad que el mueble o el aparato funciona y está completo antes de cerrar.",
            "En artículos de bebé, comprueba que tienen todas sus piezas y que no han sufrido golpes. En las sillas de coche infantiles conviene conocer su historial.",
            "Si es un mueble grande, acordad antes cómo se transporta.",
            "Quedad en un sitio público o, si hay que ver el mueble en casa, id acompañados.",
        ],
    ),
    dict(
        id="herramientas", nombre="Herramientas",
        title="Trueque de herramientas y bricolaje | Trikitrueke",
        h1="Trueque de herramientas, bricolaje y jardinería",
        desc="Cambia taladros, sierras, herramientas de mano y material de jardín. Publica gratis en Trikitrueke y probadlas en persona antes de cerrar.",
        resumen="Bricolaje, taller y jardinería.",
        intro="Tras una obra, la herramienta que compraste para un solo trabajo se queda años en el cajón, mientras que la que necesitas ahora no la tienes. El trueque de herramientas encaja bien porque cada una tiene un valor claro para quien la usa. En Trikitrueke publicas la que das y dices cuál te falta.",
        ideas=[
            "Taladros, atornilladores y amoladoras.",
            "Sierras, lijadoras y fresadoras.",
            "Herramientas de mano: llaves, alicates y martillos.",
            "Cortacésped, desbrozadora y herramientas de jardín.",
            "Escaleras, cajas de herramientas y bancos de trabajo.",
            "Material de soldadura o de pintura.",
        ],
        prep=[
            "Indica marca, modelo y potencia o tensión.",
            "Si es de batería, di cuántas baterías incluye y si hay cargador.",
            "Enumera los accesorios, discos o brocas que van con ella.",
            "Cuenta el estado: desgaste, holguras, cable.",
            "Haz fotos de la herramienta y de su placa de características.",
            "Di qué buscas o marca «Escucho ofertas».",
        ],
        seguridad=[
            "Probadla en el momento: que arranca, gira y corta con normalidad.",
            "Revisad cables, carcasas y baterías. Una batería hinchada o un cable pelado no se cambian.",
            "No cambies una herramienta con las protecciones de seguridad dañadas o retiradas.",
            "Quedad en un sitio público y con luz de día.",
        ],
    ),
]

# ---------------------------------------------------------------------------
# ZONAS (los nombres coinciden con schema.sql)
# ---------------------------------------------------------------------------
ZONAS = [
    dict(
        id="navarra", nombre="Navarra", lugares="Pamplona, Tudela, Estella, Tafalla o Sangüesa",
        title="Trueque en Navarra: cambia sin dinero | Trikitrueke",
        desc="Anuncios de trueque en Navarra: Pamplona, Tudela, Estella y más. Cambia lo que ya no usas por lo que quieres, gratis, en Trikitrueke.",
        intro="Si vives en Navarra, Trikitrueke te permite cambiar lo que ya no usas con gente de tu comunidad y de las vecinas. Publicas tu anuncio, eliges la zona Navarra y, si quieres, pones tu localidad: Pamplona, Tudela, Estella, Tafalla, Sangüesa o la que sea. Cambiar cerca facilita quedar en persona, que es como funciona esta web.",
        ideas=[
            "Bicis y material de montaña.",
            "Herramientas de bricolaje y de huerta.",
            "Libros, discos y ropa infantil.",
            "Muebles y artículos del hogar.",
            "Un fin de semana en una casa rural por una escapada a la costa.",
        ],
        consejo="Si la otra persona vive en otra localidad, quedad a medio camino entre las dos, en un sitio público y con luz de día.",
    ),
    dict(
        id="la-rioja", nombre="La Rioja", lugares="Logroño, Calahorra, Haro, Arnedo o Nájera",
        title="Trueque en La Rioja: cambia sin dinero | Trikitrueke",
        desc="Anuncios de trueque en La Rioja: Logroño, Calahorra, Haro y más. Cambia lo que ya no usas por lo que quieres, gratis, en Trikitrueke.",
        intro="En La Rioja las distancias son cortas, así que quedar en persona para un cambio resulta sencillo. En Trikitrueke publicas tu anuncio con la zona La Rioja y, si quieres, tu localidad: Logroño, Calahorra, Haro, Arnedo, Nájera o cualquier otra. Verás propuestas de tu zona y de toda España.",
        ideas=[
            "Material de bodega, de huerta y de jardín.",
            "Bicis y equipo de senderismo.",
            "Libros, discos y ropa.",
            "Muebles y menaje.",
            "Una escapada rural por otra de costa o de nieve.",
        ],
        consejo="Entre dos pueblos riojanos casi siempre hay un punto cómodo a medio camino: una plaza, una cafetería o un aparcamiento a la vista.",
    ),
    dict(
        id="aragon", nombre="Aragón", lugares="Zaragoza, Huesca, Teruel, Calatayud o Barbastro",
        title="Trueque en Aragón: cambia sin dinero | Trikitrueke",
        desc="Anuncios de trueque en Aragón: Zaragoza, Huesca, Teruel y más. Cambia lo que ya no usas por lo que quieres, gratis, en Trikitrueke.",
        intro="Aragón es grande y, fuera de las capitales, de pueblos pequeños, así que conviene pensar el desplazamiento antes de cerrar un cambio. En Trikitrueke publicas tu anuncio con la zona Aragón y tu localidad: Zaragoza, Huesca, Teruel, Calatayud, Barbastro o la tuya. Si el artículo es pequeño, es fácil quedar en una capital de comarca.",
        ideas=[
            "Material de nieve, de montaña y de escalada.",
            "Bicis y equipo de acampada.",
            "Herramientas y material de campo.",
            "Libros, discos y ropa.",
            "Casas rurales y escapadas por otras de costa.",
        ],
        consejo="Si la distancia es grande, dejad claro desde el primer mensaje quién se desplaza y hasta dónde, y quedad en una población intermedia.",
    ),
    dict(
        id="soria", nombre="Soria", lugares="Soria capital, Almazán, El Burgo de Osma o San Esteban de Gormaz",
        title="Trueque en Soria: cambia sin dinero | Trikitrueke",
        desc="Anuncios de trueque en la provincia de Soria. Cambia lo que ya no usas por lo que quieres, gratis, en Trikitrueke.",
        intro="En una provincia pequeña y de pueblos como Soria, cambiar lo que sobra por lo que falta tiene mucho sentido: se aprovecha lo que ya existe y se evitan desplazamientos largos. En Trikitrueke publicas tu anuncio con la zona Soria y tu localidad: Soria capital, Almazán, El Burgo de Osma, San Esteban de Gormaz o la tuya.",
        ideas=[
            "Herramientas, material de campo y de huerta.",
            "Bicis y equipo de senderismo.",
            "Muebles y artículos del hogar.",
            "Libros, discos y ropa.",
            "Una casa en el pueblo por una escapada en otra zona.",
        ],
        consejo="Si no encuentras lo que buscas en Soria, amplía la búsqueda a las provincias vecinas: la web funciona en toda España.",
    ),
    dict(
        id="madrid", nombre="Madrid", lugares="Madrid capital, Alcalá de Henares, Getafe, Móstoles o Alcobendas",
        title="Trueque en Madrid: cambia sin dinero | Trikitrueke",
        desc="Anuncios de trueque en Madrid: capital y municipios de la comunidad. Cambia lo que ya no usas por lo que quieres, gratis, en Trikitrueke.",
        intro="En Madrid hay mucha gente y mucho movimiento, de modo que lo habitual será encontrar propuestas cerca de casa. En Trikitrueke publicas tu anuncio con la zona Madrid y tu localidad: Madrid capital, Alcalá de Henares, Getafe, Móstoles, Alcobendas o el municipio que sea. Todo se cambia en persona, sin dinero de por medio.",
        ideas=[
            "Tecnología: móviles, portátiles y consolas.",
            "Libros, discos y cómics.",
            "Ropa y complementos.",
            "Muebles y decoración tras una mudanza.",
            "Una escapada a la sierra por otra a la costa.",
        ],
        consejo="Quedad en un punto cómodo de transporte público, como una estación de metro o de cercanías, a plena luz del día.",
    ),
    dict(
        id="cataluna", nombre="Cataluña", lugares="Barcelona, Girona, Lleida, Tarragona o Reus",
        title="Trueque en Cataluña: cambia sin dinero | Trikitrueke",
        desc="Anuncios de trueque en Cataluña: Barcelona, Girona, Lleida, Tarragona y más. Cambia lo que ya no usas por lo que quieres, gratis, en Trikitrueke.",
        intro="Cataluña reúne ciudades grandes, costa y montaña, y eso da mucho juego al trueque: lo que sobra en un sitio hace falta en otro. En Trikitrueke publicas tu anuncio con la zona Cataluña y tu localidad: Barcelona, Girona, Lleida, Tarragona, Reus o la tuya. Cambias en persona, sin pasar por una compraventa.",
        ideas=[
            "Material de montaña, de nieve y de playa.",
            "Bicis y patinetes.",
            "Tecnología y videojuegos.",
            "Libros, discos y ropa.",
            "Un apartamento de costa por una casa en el Pirineo.",
        ],
        consejo="Si cambiáis entre ciudades, buscad un punto de encuentro junto a una estación, y avisad a alguien de a dónde vas y con quién has quedado.",
    ),
]


def esc(t):
    return html.escape(t, quote=True)


def ul(items, clase=""):
    c = f' class="{clase}"' if clase else ""
    return f"<ul{c}>\n" + "\n".join(f"  <li>{esc(i)}</li>" for i in items) + "\n</ul>"


def enlaces(lista):
    return "\n".join(
        f'  <li><a href="/trueque-{x["id"]}.html">{esc(x["nombre"])}</a></li>' for x in lista
    )


def migas_jsonld(nombre, url):
    return """<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Inicio", "item": "%s/"},
    {"@type": "ListItem", "position": 2, "name": "Trueques", "item": "%s/trueque.html"},
    {"@type": "ListItem", "position": 3, "name": "%s", "item": "%s"}
  ]
}
</script>""" % (DOMINIO, DOMINIO, esc(nombre), url)


def migas_hub_jsonld():
    return """<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Inicio", "item": "%s/"},
    {"@type": "ListItem", "position": 2, "name": "Trueques", "item": "%s/trueque.html"}
  ]
}
</script>""" % (DOMINIO, DOMINIO)


def cabecera(title, desc, url, jsonld):
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Trikitrueke">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{DOMINIO}/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{DOMINIO}/og-image.jpg">
{jsonld}
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="logo" href="/" aria-label="Trikitrueke, inicio">
      <span class="mark"><img src="/logo-icono.jpg" alt="" width="44" height="44"></span>
      <span>Triki<b>Trueke</b></span>
    </a>
    <nav class="nav" aria-label="Principal"><a class="btn ghost" href="/">Ver trueques</a></nav>
  </header>
  <main class="legal">
"""


PIE = """  </main>

  <footer>
    <span>Trikitrueke. Publica tus Anuncios Gratis.</span>
    <nav aria-label="Información legal">
      <a href="/aviso-legal.html">Aviso legal</a>
      <a href="/privacidad.html">Privacidad</a>
      <a href="/cookies.html">Cookies</a>
      <a href="/normas.html">Normas de uso</a>
    </nav>
  </footer>
</div>
</body>
</html>
"""


def bloque_pasos():
    li = "\n".join(
        f"  <li><b>{esc(t)}.</b> {esc(d)}</li>" for t, d in PASOS
    )
    return f"<ol>\n{li}\n</ol>"


def bloque_cta():
    return ('<p class="cta"><a class="btn" href="/">Ver los trueques</a> '
            '<a class="btn swap" href="/">Publicar mi trueque</a></p>')


def bloque_explorar(excluir=None):
    cats = [c for c in CATEGORIAS if c["id"] != excluir]
    zonas = [z for z in ZONAS if z["id"] != excluir]
    return f"""    <h2>Explora más trueques</h2>
    <p>Por categoría:</p>
    <ul class="rel">
{enlaces(cats)}
    </ul>
    <p>Por zona:</p>
    <ul class="rel">
{enlaces(zonas)}
    </ul>
"""


def indentar(texto, n=4):
    pad = " " * n
    return "\n".join(pad + l if l else l for l in texto.split("\n"))


def pagina_categoria(c):
    url = f"{DOMINIO}/trueque-{c['id']}.html"
    seg = c["seguridad"] + [SEGURIDAD_COMUN]
    cuerpo = f"""    <p class="crumbs"><a href="/">Inicio</a> › <a href="/trueque.html">Trueques</a> › {esc(c['nombre'])}</p>
    <h1>{esc(c['h1'])}</h1>
    <p>{esc(c['intro'])}</p>
    <p class="cta"><a class="btn" href="/">Ver los trueques</a> <a class="btn swap" href="/">Publicar mi trueque</a></p>

    <h2>Qué se suele cambiar</h2>
{indentar(ul(c['ideas']))}

    <h2>Cómo preparar tu anuncio</h2>
{indentar(ul(c['prep']))}

    <h2>Antes de quedar</h2>
{indentar(ul(seg))}

    <h2>Cómo funciona</h2>
{indentar(bloque_pasos())}
    <p>Publicar es gratis y aquí no se vende: solo se cambia. Puedes leer las <a href="/normas.html">normas de uso</a> antes de empezar.</p>
    {bloque_cta()}

{bloque_explorar(c['id'])}"""
    return cabecera(c["title"], c["desc"], url, migas_jsonld(c["nombre"], url)) + cuerpo + PIE


def pagina_zona(z):
    url = f"{DOMINIO}/trueque-{z['id']}.html"
    pub = [
        f"Elige «{z['nombre']}» en el campo Zona y, si quieres, escribe tu localidad. Nunca pongas tu dirección.",
        "Describe lo que das con su estado real y añade una foto.",
        "Di qué buscas o marca «Escucho ofertas» si aceptas propuestas de cualquier cosa.",
        "Piensa hasta dónde estás dispuesto a desplazarte para cambiar.",
    ]
    seg = [
        z["consejo"],
        "Quedad en un sitio público y con luz de día.",
        "Comprobad el artículo en el momento y antes de cerrar el cambio.",
        SEGURIDAD_COMUN,
    ]
    cuerpo = f"""    <p class="crumbs"><a href="/">Inicio</a> › <a href="/trueque.html">Trueques</a> › {esc(z['nombre'])}</p>
    <h1>Trueque en {esc(z['nombre'])}: cambia lo que ya no usas</h1>
    <p>{esc(z['intro'])}</p>
    <p class="cta"><a class="btn" href="/">Ver los trueques</a> <a class="btn swap" href="/">Publicar mi trueque</a></p>

    <h2>Qué se puede cambiar cerca de ti</h2>
{indentar(ul(z['ideas']))}

    <h2>Cómo publicar tu trueque en {esc(z['nombre'])}</h2>
{indentar(ul(pub))}

    <h2>Antes de quedar</h2>
{indentar(ul(seg))}

    <h2>Cómo funciona</h2>
{indentar(bloque_pasos())}
    <p>Publicar es gratis y aquí no se vende: solo se cambia. Puedes leer las <a href="/normas.html">normas de uso</a> antes de empezar.</p>
    {bloque_cta()}

{bloque_explorar(z['id'])}"""
    return cabecera(z["title"], z["desc"], url, migas_jsonld(z["nombre"], url)) + cuerpo + PIE


def pagina_hub():
    url = f"{DOMINIO}/trueque.html"
    title = "Trueques por categoría y zona | Trikitrueke"
    desc = "Encuentra trueques por categoría (libros, ropa, vehículos, herramientas...) y por zona en Trikitrueke. Cambia lo que ya no usas, gratis y sin dinero."
    cats = "\n".join(
        f'  <li><a href="/trueque-{c["id"]}.html">{esc(c["nombre"])}</a>: {esc(c["resumen"])}</li>' for c in CATEGORIAS
    )
    zonas = "\n".join(
        f'  <li><a href="/trueque-{z["id"]}.html">{esc(z["nombre"])}</a>: {esc(z["lugares"])}.</li>' for z in ZONAS
    )
    cuerpo = f"""    <p class="crumbs"><a href="/">Inicio</a> › Trueques</p>
    <h1>Trueques por categoría y zona</h1>
    <p>Trikitrueke es una web de anuncios entre particulares donde solo se cambia: pones lo que das, dices lo que buscas y alguien te propone el cambio. Aquí tienes guías para cada categoría y para las zonas donde más se va a cambiar, con ideas, consejos para preparar tu anuncio y precauciones antes de quedar.</p>
    <p class="cta"><a class="btn" href="/">Ver los trueques</a> <a class="btn swap" href="/">Publicar mi trueque</a></p>

    <h2>Por categoría</h2>
    <ul>
{indentar(cats, 2)}
    </ul>

    <h2>Por zona</h2>
    <ul>
{indentar(zonas, 2)}
    </ul>
    <p>¿Tu zona no aparece? La web funciona en toda España: al publicar puedes crear tu provincia o comunidad.</p>
"""
    return cabecera(title, desc, url, migas_hub_jsonld()) + cuerpo + PIE


def sitemap():
    filas = [
        ("/", HOY, "daily", "1.0"),
        ("/trueque.html", HOY, "weekly", "0.8"),
    ]
    for c in CATEGORIAS:
        filas.append((f"/trueque-{c['id']}.html", HOY, "monthly", "0.7"))
    for z in ZONAS:
        filas.append((f"/trueque-{z['id']}.html", HOY, "monthly", "0.7"))
    filas += [
        ("/normas.html", "2026-10-31", "yearly", "0.4"),
        ("/aviso-legal.html", "2026-10-31", "yearly", "0.2"),
        ("/privacidad.html", "2026-10-31", "yearly", "0.2"),
        ("/cookies.html", "2026-10-31", "yearly", "0.2"),
    ]
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for ruta, lm, cf, pr in filas:
        out.append(f"  <url><loc>{DOMINIO}{ruta}</loc><lastmod>{lm}</lastmod>"
                   f"<changefreq>{cf}</changefreq><priority>{pr}</priority></url>")
    out.append("</urlset>")
    return "\n".join(out) + "\n"


def escribir(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)


def comprobar():
    ids = [x["id"] for x in CATEGORIAS + ZONAS]
    assert len(ids) == len(set(ids)), "id repetido entre categorías y zonas"
    for x in CATEGORIAS + ZONAS:
        assert len(x["title"]) <= 70, (x["id"], "title largo", len(x["title"]))
        assert len(x["desc"]) <= 165, (x["id"], "description larga", len(x["desc"]))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    repo = sys.argv[1]
    comprobar()
    escribir(os.path.join(repo, "trueque.html"), pagina_hub())
    for c in CATEGORIAS:
        escribir(os.path.join(repo, "trueque-" + c["id"] + ".html"), pagina_categoria(c))
    for z in ZONAS:
        escribir(os.path.join(repo, "trueque-" + z["id"] + ".html"), pagina_zona(z))
    escribir(os.path.join(repo, "sitemap.xml"), sitemap())
    print("Generadas %d páginas y sitemap con %d URLs" % (
        1 + len(CATEGORIAS) + len(ZONAS), 2 + len(CATEGORIAS) + len(ZONAS) + 4))


if __name__ == "__main__":
    main()
