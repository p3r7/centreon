<?php
/*
 * Copyright 2005-2014 MERETHIS
 * Centreon is developped by : Julien Mathis and Romain Le Merlus under
 * GPL Licence 2.0.
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation ; either version 2 of the License.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 * PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, see <http://www.gnu.org/licenses>.
 *
 * Linking this program statically or dynamically with other modules is making a
 * combined work based on this program. Thus, the terms and conditions of the GNU
 * General Public License cover the whole combination.
 *
 * As a special exception, the copyright holders of this program give MERETHIS
 * permission to link this program with independent modules to produce an executable,
 * regardless of the license terms of these independent modules, and to copy and
 * distribute the resulting executable under terms of MERETHIS choice, provided that
 * MERETHIS also meet, for each linked independent module, the terms  and conditions
 * of the license of that module. An independent module is a module which is not
 * derived from this program. If you modify this program, you may extend this
 * exception to your version of the program, but you are not obliged to do so. If you
 * do not wish to do so, delete this exception statement from your version.
 *
 * For more information : contact@centreon.com
 *
 */

namespace Centreon\Core;

/**
 * @author Lionel Assepo <lassepo@merethis.com>
 * @package Centreon
 * @subpackage Core
 */
class Datatable
{
    public function __construct()
    {
        
    }
    
    public static function getDatas($object, $params = array())
    {
        // Get connection
        $objectToCall = '\\Centreon\\Repository\\'.ucwords(strtolower($object)).'Repository';
        $datasToSend = $objectToCall::getDatasForDatatable($params);
        
        // format the data before returning
        $finalDatas = json_encode(
            array(
                "sEcho" => intval($params['sEcho']),
                "iTotalRecords" => count($datasToSend),
                "iTotalDisplayRecords" => $objectToCall::getTotalRecordsForDatatable($params),
                "aaData" => $datasToSend
            )
        );
        
        return $finalDatas;
    }
    
    public static function getConfiguration($object)
    {
        // Get connection
        $objectToCall = '\\Centreon\\Repository\\'.ucwords(strtolower($object)).'Repository';
        return $objectToCall::getParametersForDatatable();
    }
    
    public static function castResult($element, $object)
    {
        $elementField = array_keys($element);
        $object = ucwords(strtolower($object));
        $objectToCall = '\\Centreon\\Repository\\'.$object.'Repository';
        foreach ($objectToCall::$columnCast as $castField=>$castParameters) {
            $subCaster = 'add'.ucwords($castParameters['type']);
            $element[$castField] = self::$subCaster(
                $object,
                $castField,
                $castParameters['parameters'],
                $elementField,
                $element
            );
        }
        return $element;
    }


    public static function addUrl($object, $fields, $values, $elementField, $element)
    {
        $castedElement = \array_map(function($n) {return "::$n::";}, $elementField);
        
        $routeParams = array();
        if (isset($values['routeParams']) && is_array($values['routeParams'])) {
            $routeParams = str_replace($castedElement, $element, $values['routeParams']);
        }
        $finalRoute = str_replace(
            "//",
            "/",
            \Centreon\Core\Di::getDefault()
                ->get('router')
                ->getPathFor($values['route'], $routeParams)
        );
        
        $linkName =  str_replace($castedElement, $element, $values['linkName']);
        
        return '<a href="'. $finalRoute .'">'. $linkName .'</a>';
    }
    
    public static function addCheckbox($object, $fields, $values, $elementField, $element)
    {
        $input = '<input class="all'. $object .'Box" '
            . 'id="'. $object .'::'. $fields .'::" '
            . 'name="'. $object .'[]" '
            . 'type="checkbox" '
            . 'value="::'. $fields .'::" '
            . '/>';
        $castedElement = \array_map(function($n) {return "::$n::";}, $elementField);
        return str_replace($castedElement, $element, $input);
    }
    
    public static function addSelect($object, $fields, $values, $elementField, $element)
    {
        return $values[$element[$fields]];
    }
}
