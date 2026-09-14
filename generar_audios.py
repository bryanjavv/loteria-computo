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

# 3. Diccionario mapeado exactamente a las 40 cartas de tu lista
cartas = {
    "von_neumann": "Von Neumann",
    "harvard": "Harvard",
    "cpu": "El CPU",
    "nucleo": "El Núcleo",
    "hilo": "El Hilo",
    "frecuencia": "La Frecuencia de Reloj",
    "cache": "La Caché",
    "niveles_cache": "Niveles de Caché",
    "alu": "La ALU",
    "control": "La Unidad de Control",
    "registros": "Los Registros",
    "arquitectura": "La Arquitectura",
    "buses": "Los Buses",
    "ciclo": "Ciclo de Instrucción",
    "ipc": "El IPC",
    "overclocking": "El Overclocking",
    "socket": "El Socket",
    "ram": "La Memoria RAM",
    "rom": "La Memoria ROM",
    "semiconductora": "La Memoria Semiconductora",
    "mrom": "La MROM",
    "prom": "La PROM",
    "eeprom": "La EEPROM",
    "dma": "El DMA",
    "hdd": "El Disco HDD",
    "ssd": "El Disco SSD",
    "cloud": "El Cloud",
    "virtual": "La Memoria Virtual",
    "gpu": "La GPU",
    "pipeline": "El Pipeline",
    "risc": "RISC",
    "cisc": "CISC",
    "chipset": "El Chipset",
    "bios": "El BIOS",
    "fuente": "La Fuente de Poder",
    "disipador": "El Disipador",
    "ventilador": "El Ventilador",
    "so": "El Sistema Operativo",
    "kernel": "El Kernel",
    "multiprocesador": "El Multiprocesador"
}

# 4. Generar y guardar los audios con acento mexicano
print("🎙️  Generando nuevas voces...")
for nombre_archivo, frase in cartas.items():
    ruta = f"{directorio}/{nombre_archivo}.mp3"
    
    tts = gTTS(text=frase, lang='es', tld='com.mx', slow=False)
    tts.save(ruta)
    print(f"✅ Guardado: {nombre_archivo}.mp3 -> '{frase}'")

print("🎉 ¡Todos los audios sincronizados con tus CARTAS han sido generados exitosamente!")