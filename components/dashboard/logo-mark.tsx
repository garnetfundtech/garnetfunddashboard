import Image from "next/image";

export function LogoMark() {
  return (
    <Image
      src="/Garnet Fund Icon.png"
      alt="Garnet Fund"
      width={20}
      height={20}
      className="h-5 w-5 shrink-0"
    />
  );
}
