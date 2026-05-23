import Image from "next/image";

export function LogoMark() {
  return (
    <div className="px-1 py-1">
      <div className="flex items-center gap-2">
        <Image
          src="/Garnet Fund Icon.png"
          alt="Garnet Fund"
          width={20}
          height={20}
          className="h-5 w-5"
        />
        <p className="text-lg font-semibold tracking-tight text-white">USC Garnet Fund</p>
      </div>
    </div>
  );
}
