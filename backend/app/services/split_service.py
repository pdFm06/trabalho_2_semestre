def split_file(data: bytes, parts: int = 3) -> list[bytes]:
    if parts <= 0:
        raise ValueError("O número de partes deve ser maior que zero.")
    if len(data) < parts:
        raise ValueError("O ficheiro é demasiado pequeno para ser dividido nesse número de partes.")

    size = len(data) // parts
    chunks = []

    for i in range(parts - 1):
        chunks.append(data[i * size : (i + 1) * size])

    chunks.append(data[(parts - 1) * size :])

    return chunks
