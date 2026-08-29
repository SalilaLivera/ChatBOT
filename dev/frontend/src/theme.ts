import { Platform } from "react-native";

export const colors = {
  primary: "#D96C8A", deepPink: "#B94F70", lightPink: "#F6D6DF", veryLightPink: "#FDF4F7",
  ink: "#30272A", muted: "#75666B", paper: "#FFF9FA", card: "#FFFFFF",
  sage: "#F6D6DF", sageDark: "#B94F70", mint: "#FDF4F7", peach: "#F6D6DF",
  lavender: "#FDF4F7", safety: "#B94F70", border: "#EBDDE2", white: "#FFFFFF"
};

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };
export const type = { body: 16, small: 13, title: 30, heading: 20 };
export const fonts = {
  regular: "Nunito_400Regular",
  semiBold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extraBold: "Nunito_800ExtraBold"
};
export const shadow = Platform.select({ web: { boxShadow: "0 10px 30px rgba(40,70,55,.08)" }, default: { elevation: 2 } });
