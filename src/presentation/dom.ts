export function element<Kind extends typeof HTMLElement>(id: string, kind: Kind): InstanceType<Kind> {
    const value = document.getElementById(id);
    if (!(value instanceof kind)) throw new Error(`Не найден элемент #${id}`);
    return value as InstanceType<Kind>;
}

export function button(label: string, action: () => void, className?: string): HTMLButtonElement {
    const result = document.createElement('button');
    result.type = 'button';
    result.textContent = label;
    if (className) result.className = className;
    result.addEventListener('click', action);
    return result;
}
