def split_file(data: bytes, parts: int = 3) -> list[bytes]:
    """
    Divide um ficheiro (em bytes) em N partes aproximadamente iguais.

    Problema do código original:
        size = len(data) // parts
        return [data[i*size:(i+1)*size] for i in range(parts)]
    → Os bytes finais eram perdidos se len(data) não fosse divisível por 'parts'.
      Ex: 10 bytes em 3 partes → size=3 → 3+3+3 = 9 bytes. O 10.º byte desaparecia!

    Solução aplicada:
    - As primeiras (parts - 1) partes têm tamanho fixo (size).
    - A ÚLTIMA parte vai do ponto (parts-1)*size até ao fim,
      ficando com todos os bytes restantes (incluindo o "resto").
    
    Exemplo com 10 bytes, 3 partes:
        size = 10 // 3 = 3
        parte 0 → bytes [0:3]  = 3 bytes
        parte 1 → bytes [3:6]  = 3 bytes
        parte 2 → bytes [6:]   = 4 bytes  ← apanha o resto
    """
    if parts <= 0:
        raise ValueError("O número de partes deve ser maior que zero.")
    if len(data) < parts:
        raise ValueError("O ficheiro é demasiado pequeno para ser dividido nesse número de partes.")

    size = len(data) // parts
    chunks = []

    for i in range(parts - 1):
        # Cada parte intermédia tem exatamente 'size' bytes
        chunks.append(data[i * size : (i + 1) * size])

    # A última parte apanha tudo o que sobra (pode ser ligeiramente maior)
    chunks.append(data[(parts - 1) * size :])

    return chunks


def reassemble_file(parts: list[bytes]) -> bytes:
    """
    Reconstrói o ficheiro original juntando todas as partes por ordem.

    As partes devem ser fornecidas na mesma ordem em que foram criadas.
    A função simplesmente concatena os bytes — b"".join() é eficiente
    e não cria cópias intermédias desnecessárias.
    """
    return b"".join(parts)