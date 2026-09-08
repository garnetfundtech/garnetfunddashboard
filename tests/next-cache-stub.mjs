// unstable_cache outside a Next request: call straight through, cache nothing.
export const unstable_cache = (fn) => fn;
export const revalidatePath = () => {};
export const revalidateTag = () => {};
