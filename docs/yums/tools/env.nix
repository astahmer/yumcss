let pkgs = import (builtins.getFlake "nixpkgs") {}; in
pkgs.buildEnv { name = "yums-env"; paths = [ pkgs.potrace pkgs.librsvg (pkgs.python3.withPackages (p: with p; [numpy scipy pillow scikit-image])) ]; }
