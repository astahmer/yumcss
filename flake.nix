{
  description = "pandwind development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nub.url = "github:nubjs/nub";
    nub.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { nixpkgs, nub, ... }:
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
        in
        {
          default = pkgs.mkShell {
            packages = [
              nub.packages.${system}.default
              pkgs.nodejs_24
              pkgs.pnpm
              pkgs.git
              pkgs.jq
              pkgs.nixfmt
            ];
          };
        }
      );
    };
}
