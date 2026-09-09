{
  description = "pandwind development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
    in
    {
      devShells = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nubVersion = "0.8.2";
          nubSource =
            {
              aarch64-darwin = {
                url = "https://github.com/nubjs/nub/releases/download/v${nubVersion}/nub-darwin-arm64.tar.gz";
                hash = "sha256-YSkUoDssf9YuPnfHarhr7MPyYd6BytP6DcARIZfWUYQ=";
              };
              aarch64-linux = {
                url = "https://github.com/nubjs/nub/releases/download/v${nubVersion}/nub-linux-arm64.tar.gz";
                hash = "sha256-bXTl5SsgS/bAQNJ3jos58n0bOJMcig6iN3i7+bEUMrY=";
              };
              x86_64-linux = {
                url = "https://github.com/nubjs/nub/releases/download/v${nubVersion}/nub-linux-x64.tar.gz";
                hash = "sha256-F7dpNBH3L+TxwqscBnJ8KqmLWlRBq7pgyg/kzLYzEyg=";
              };
            }
            .${system} or (throw "Unsupported platform for nub: ${system}");
          nub = pkgs.stdenvNoCC.mkDerivation {
            pname = "nub";
            version = nubVersion;
            src = pkgs.fetchurl nubSource;
            sourceRoot = ".";
            dontFixup = pkgs.stdenvNoCC.hostPlatform.isDarwin;
            nativeBuildInputs = pkgs.lib.optionals pkgs.stdenvNoCC.hostPlatform.isLinux [
              pkgs.autoPatchelfHook
            ];
            installPhase = ''
              runHook preInstall
              install -Dm755 bin/nub "$out/bin/nub"
              runHook postInstall
            '';
            meta = {
              description = "Fast all-in-one Node.js toolkit (prebuilt upstream binary)";
              homepage = "https://github.com/nubjs/nub";
              license = pkgs.lib.licenses.mit;
              mainProgram = "nub";
              platforms = [
                "aarch64-darwin"
                "aarch64-linux"
                "x86_64-linux"
              ];
            };
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              nub
              pkgs.nodejs_24
              # Corepack resolves the exact version declared by package.json.
              pkgs.corepack_24
              pkgs.git
              pkgs.jq
              pkgs.nixfmt
            ];
          };
        }
      );
    };
}
