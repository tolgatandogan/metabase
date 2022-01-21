import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Button from "metabase/core/components/Button";
import fitViewport from "metabase/hoc/FitViewPort";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { PermissionsTabs } from "./PermissionsTabs";
import {
  FullHeightContainer,
  TabsContainer,
  PermissionPageRoot,
  HelpButton,
  PermissionPageContent,
  PermissionPageSidebar,
  CloseSidebarButton,
} from "./PermissionsPageLayout.styled";
import { PermissionsEditBar } from "./PermissionsEditBar";
import { useLeaveConfirmation } from "../../hooks/use-leave-confirmation";
import { withRouter } from "react-router";
import { clearSaveError } from "../../permissions";
import Icon from "metabase/components/Icon";

const mapDispatchToProps = {
  navigateToTab: tab => push(`/admin/permissions/${tab}`),
  navigateToLocation: location => push(location.pathname, location.state),
  clearSaveError,
};

const mapStateToProps = (state, _props) => {
  return {
    saveError: state.admin.permissions.saveError,
  };
};

const propTypes = {
  children: PropTypes.node.isRequired,
  tab: PropTypes.oneOf(["data", "collections"]).isRequired,
  confirmBar: PropTypes.node,
  diff: PropTypes.object,
  isDirty: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
  saveError: PropTypes.string,
  clearSaveError: PropTypes.func.isRequired,
  navigateToLocation: PropTypes.func.isRequired,
  router: PropTypes.object,
  route: PropTypes.object,
  navigateToTab: PropTypes.func.isRequired,
  helpContent: PropTypes.node,
};

function PermissionsPageLayout({
  children,
  tab,
  diff,
  isDirty,
  onSave,
  onLoad,
  saveError,
  clearSaveError,
  router,
  route,
  navigateToLocation,
  navigateToTab,
  helpContent,
}) {
  const [shouldShowHelp, setShouldShowHelp] = useState(false);
  const beforeLeaveConfirmation = useLeaveConfirmation({
    router,
    route,
    onConfirm: navigateToLocation,
    isEnabled: isDirty,
  });

  return (
    <PermissionPageRoot>
      <PermissionPageContent>
        {isDirty && (
          <PermissionsEditBar
            diff={diff}
            isDirty={isDirty}
            onSave={onSave}
            onCancel={() => onLoad()}
          />
        )}

        <Modal isOpen={saveError != null}>
          <ModalContent
            title={t`There was an error saving`}
            formModal
            onClose={clearSaveError}
          >
            <p className="mb4">{saveError}</p>
            <div className="ml-auto">
              <Button onClick={clearSaveError}>{t`OK`}</Button>
            </div>
          </ModalContent>
        </Modal>

        {beforeLeaveConfirmation}

        <TabsContainer className="border-bottom">
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          {helpContent && !shouldShowHelp && (
            <HelpButton onClick={() => setShouldShowHelp(prev => !prev)}>
              <Icon name="info" size={20} mr={1} />
              {t`Permission help`}
            </HelpButton>
          )}
        </TabsContainer>

        <FullHeightContainer>{children}</FullHeightContainer>
      </PermissionPageContent>

      {shouldShowHelp && (
        <PermissionPageSidebar>
          <CloseSidebarButton
            size={20}
            onClick={() => setShouldShowHelp(prev => !prev)}
          />
          {helpContent}
        </PermissionPageSidebar>
      )}
    </PermissionPageRoot>
  );
}

PermissionsPageLayout.propTypes = propTypes;

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  fitViewport,
  withRouter,
)(PermissionsPageLayout);
