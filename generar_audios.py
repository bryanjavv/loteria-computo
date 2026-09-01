import os
import glob
from gtts import gTTS

directorio = "public/audio"

# 1. Crear la carpeta si no existe
if not os.path.exists(directorio):
    os.makedirs(directorio)

# 2. Borrar todos los audios .mp3 viejos
archivos_viejos = glob.glob(f"{directorio}/*.mp3")
for archivo in archivos_viejos:
    os.remove(archivo)
print("🗑️  Audios anteriores eliminados.")

# 3. Diccionario exclusivo con los nombres cortos de tu lista CARTAS
cartas = {
    "cpu": "El CPU",
    "ram": "La Memoria RAM",
    "bus_datos": "El Bus de Datos",
    "alu": "La ALU",
    "cache": "La Caché L1",
    "gpu": "La GPU",
    "pipeline": "El Pipeline",
    "ssd": "El Disco SSD",
    "hdd": "El Disco Duro",
    "rom": "La Memoria ROM",
    "registro": "El Registro",
    "reloj": "El Reloj del Sistema",
    "motherboard": "La Tarjeta Madre",
    "control": "La Unidad de Control",
    "fuente": "La Fuente de Poder",
    "disipador": "El Disipador",
    "pcie": "El Puerto PCIe",
    "bios": "El BIOS",
    "bus_dir": "El Bus de Direcciones",
    "virtual": "La Memoria Virtual",
    "socket": "El Socket",
    "chipset": "El Chipset",
    "puente_norte": "El Puente Norte",
    "puente_sur": "El Puente Sur",
    "pila": "La Pila CMOS",
    "ventilador": "El Ventilador",
    "usb": "El Puerto USB",
    "hdmi": "El Puerto HDMI",
    "ethernet": "El Puerto Ethernet",
    "red": "La Tarjeta de Red",
    "modem": "El Módem",
    "router": "El Router",
    "firewall": "El Firewall",
    "antivirus": "El Antivirus",
    "so": "El Sistema Operativo",
    "kernel": "El Kernel",
    "driver": "El Driver",
    "compilador": "El Compilador",
    "ensamblador": "El Ensamblador",
    "interprete": "El Interprete"
}

# 4. Generar y guardar los audios cortos
print("🎙️  Generando nuevas voces rápidas...")
for nombre_archivo, frase in cartas.items():
    ruta = f"{directorio}/{nombre_archivo}.mp3"
    
    # Se mantiene el acento mexicano (com.mx)
    tts = gTTS(text=frase, lang='es', tld='com.mx', slow=False)
    tts.save(ruta)
    print(f"✅ Guardado: {nombre_archivo}.mp3 -> '{frase}'")

print("🎉 ¡Todos los audios cortos han sido generados exitosamente!")