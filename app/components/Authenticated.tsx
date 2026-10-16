import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Redirect } from "react-router-dom";
import { toast } from "sonner";
import { languages } from "@shared/i18n";
import env from "~/env";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import Logger from "~/utils/Logger";
import { changeLanguage } from "~/utils/language";
import LoadingIndicator from "./LoadingIndicator";

type Props = {
  children: JSX.Element;
};

const Authenticated = ({ children }: Props) => {
  const { auth } = useStores();
  const { t, i18n } = useTranslation();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const language =
    user?.language && languages.includes(user.language)
      ? user.language
      : env.DEFAULT_LANGUAGE || "en_US";

  // Watching for language changes here as this is the earliest point we might have the user
  // available and means we can start loading translations faster
  React.useEffect(() => {
    void changeLanguage(language, i18n).catch((err) => {
      Logger.error("Failed to change language", err);
      toast.error(t("Unable to change language. Please try again."));
    });
  }, [i18n, language, t]);

  React.useEffect(() => {
    const handleFocus = () => {
      if (user && !user.isSaving && !auth.isFetching) {
        void auth.fetchAuth();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [auth, user]);

  if (auth.authenticated) {
    return children;
  }

  if (auth.isFetching) {
    return <LoadingIndicator />;
  }

  void auth.logout(true);
  return <Redirect to="/" />;
};

export default observer(Authenticated);
