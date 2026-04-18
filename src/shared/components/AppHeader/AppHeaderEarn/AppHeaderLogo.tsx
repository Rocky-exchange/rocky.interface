// Auto-generated AppHeaderLogo for /earn route

import ButtonLink from "components/Button/ButtonLink";

import logoIcon from "img/logo-icon.png";

export function AppHeaderLogo() {
  return (
    <ButtonLink to="/" className="flex items-center gap-8 px-6 py-4 text-typography-primary lg:hidden">
      <img src={logoIcon} alt="rocky Logo" className="block h-24 logo-glow" />
      <span className="hidden md:block text-xl font-bold tracking-wider gold-gradient-text">rocky</span>
    </ButtonLink>
  );
}

