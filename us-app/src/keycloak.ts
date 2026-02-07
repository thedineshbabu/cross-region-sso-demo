import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "http://localhost:8080",
  realm: "us-realm",
  clientId: "us-react-app",
});

export default keycloak;

