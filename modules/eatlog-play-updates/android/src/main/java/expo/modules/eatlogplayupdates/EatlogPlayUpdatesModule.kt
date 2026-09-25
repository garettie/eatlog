package expo.modules.eatlogplayupdates

import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Asks Google Play whether a newer build is available to this install. Detection only: the app
 * announces it and the user updates from the Play Store listing. Play answers per device, so a
 * staged rollout or pending review never announces a version the user cannot install yet.
 */
class EatlogPlayUpdatesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EatlogPlayUpdates")

    AsyncFunction("isUpdateAvailableAsync") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      AppUpdateManagerFactory.create(context.applicationContext).appUpdateInfo
        .addOnSuccessListener { info ->
          promise.resolve(info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE)
        }
        .addOnFailureListener { error ->
          // Sideloaded, fork, and Play-less installs all land here.
          promise.reject(CodedException("Google Play update check failed: ${error.message}", error))
        }
    }
  }
}
