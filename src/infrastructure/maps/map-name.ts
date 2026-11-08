export function validMapName(value: string): boolean {
    return value.trim() === value && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value) && !value.startsWith('custom-') && value !== 'demo';
}
